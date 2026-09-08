import ExpoModulesCore
import HealthKit

public final class FiteatsyHealthKitModule: Module {
  private let store = HKHealthStore()
  private let iso = ISO8601DateFormatter()
  private var observerQueries: [HKObserverQuery] = []
  private let metricsKey = "fiteatsy.healthkit.observerMetrics"

  public func definition() -> ModuleDefinition {
    Name("FiteatsyHealthKit")
    Events("onHealthDataChanged")
    OnCreate { self.restoreObservers() }
    OnDestroy { self.observerQueries.forEach(self.store.stop); self.observerQueries.removeAll() }

    AsyncFunction("isAvailable") { HKHealthStore.isHealthDataAvailable() }

    AsyncFunction("requestAuthorization") { (metrics: [String], promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else { promise.reject("HEALTHKIT_UNAVAILABLE", "HealthKit is unavailable"); return }
      let types = Set(metrics.compactMap { self.sampleType($0) })
      self.store.requestAuthorization(toShare: [], read: types) { success, error in
        if let error { promise.reject("HEALTHKIT_AUTHORIZATION_FAILED", error.localizedDescription); return }
        promise.resolve(["grantedScopes": success ? metrics : []])
      }
    }

    AsyncFunction("readChanges") { (metric: String, anchorText: String?, startText: String?, promise: Promise) in
      guard let type = self.sampleType(metric) else { promise.reject("HEALTHKIT_UNSUPPORTED_METRIC", metric); return }
      let anchor = anchorText.flatMap { Data(base64Encoded: $0) }.flatMap { try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0) }
      let start = startText.flatMap { self.iso.date(from: $0) }
      let predicate = start.map { HKQuery.predicateForSamples(withStart: $0, end: nil, options: []) }
      let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: anchor, limit: HKObjectQueryNoLimit) {
        _, samples, deleted, newAnchor, error in
        if let error { promise.reject("HEALTHKIT_READ_FAILED", error.localizedDescription); return }
        let rows = (samples ?? []).compactMap { self.serialize($0, metric: metric) }
        let deletedIds = (deleted ?? []).map { $0.uuid.uuidString }
        let anchorData = newAnchor.flatMap { try? NSKeyedArchiver.archivedData(withRootObject: $0, requiringSecureCoding: true) }
        promise.resolve(["samples": rows, "deletedIds": deletedIds, "anchor": anchorData?.base64EncodedString() ?? ""])
      }
      self.store.execute(query)
    }

    AsyncFunction("enableBackgroundDelivery") { (metrics: [String], promise: Promise) in
      UserDefaults.standard.set(metrics, forKey: self.metricsKey)
      self.registerObservers(metrics)
      let group = DispatchGroup(); var ok = true
      for metric in metrics.compactMap({ self.sampleType($0) }) {
        group.enter(); self.store.enableBackgroundDelivery(for: metric, frequency: .hourly) { success, _ in ok = ok && success; group.leave() }
      }
      group.notify(queue: .main) { promise.resolve(ok) }
    }
  }

  private func restoreObservers() {
    registerObservers(UserDefaults.standard.stringArray(forKey: metricsKey) ?? [])
  }

  private func registerObservers(_ metrics: [String]) {
    observerQueries.forEach(store.stop); observerQueries.removeAll()
    for (metric, type) in metrics.compactMap({ metric in sampleType(metric).map { (metric, $0) } }) {
      let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, error in
        defer { completion() }
        guard error == nil else { return }
        self?.sendEvent("onHealthDataChanged", ["metric": metric])
      }
      observerQueries.append(query); store.execute(query)
    }
  }

  private func sampleType(_ metric: String) -> HKSampleType? {
    let ids: [String: HKQuantityTypeIdentifier] = [
      "steps": .stepCount, "resting_heart_rate": .restingHeartRate, "heart_rate": .heartRate,
      "hrv_ms": .heartRateVariabilitySDNN, "active_energy": .activeEnergyBurned,
      "distance": .distanceWalkingRunning, "weight": .bodyMass, "hydration_ml": .dietaryWater,
      "spo2": .oxygenSaturation, "respiratory_rate": .respiratoryRate
    ]
    if metric == "sleep_minutes" { return HKObjectType.categoryType(forIdentifier: .sleepAnalysis) }
    if metric == "workout_minutes" { return HKObjectType.workoutType() }
    return ids[metric].flatMap { HKObjectType.quantityType(forIdentifier: $0) }
  }

  private func serialize(_ sample: HKSample, metric: String) -> [String: Any]? {
    var value = sample.endDate.timeIntervalSince(sample.startDate) / 60; var unit = "min"
    if let quantity = sample as? HKQuantitySample {
      let units: [String: HKUnit] = ["steps": .count(),"resting_heart_rate": HKUnit.count().unitDivided(by: .minute()),
        "heart_rate": HKUnit.count().unitDivided(by: .minute()),"hrv_ms": .secondUnit(with: .milli),
        "active_energy": .kilocalorie(),"distance": .meter(),"weight": .gramUnit(with: .kilo),
        "hydration_ml": .literUnit(with: .milli),"spo2": .percent(),"respiratory_rate": HKUnit.count().unitDivided(by: .minute())]
      guard let target = units[metric] else { return nil }; value = quantity.quantity.doubleValue(for: target)
      unit = ["steps":"count","resting_heart_rate":"bpm","heart_rate":"bpm","hrv_ms":"ms","active_energy":"kcal",
              "distance":"m","weight":"kg","hydration_ml":"ml","spo2":"pct","respiratory_rate":"brpm"][metric] ?? ""
      if metric == "spo2" { value *= 100 }
    }
    var row: [String: Any] = ["id":sample.uuid.uuidString,"metric":metric,"value":value,"unit":unit,
      "startAtISO":iso.string(from: sample.startDate),"endAtISO":iso.string(from: sample.endDate),
      "sourceApplication":sample.sourceRevision.source.bundleIdentifier,"device":sample.device?.name ?? ""]
    if let category = sample as? HKCategorySample, metric == "sleep_minutes" { row["sleepStage"] = sleepStage(category.value) }
    if metric == "hrv_ms" { row["measurementMethod"] = "SDNN" }
    return row
  }

  private func sleepStage(_ value: Int) -> String {
    if #available(iOS 16.0, *) {
      switch value {
      case HKCategoryValueSleepAnalysis.asleepREM.rawValue: return "REM"
      case HKCategoryValueSleepAnalysis.asleepDeep.rawValue: return "DEEP"
      case HKCategoryValueSleepAnalysis.asleepCore.rawValue: return "CORE"
      case HKCategoryValueSleepAnalysis.awake.rawValue: return "AWAKE"
      default: return "ASLEEP_UNSPECIFIED"
      }
    }
    return value == HKCategoryValueSleepAnalysis.awake.rawValue ? "AWAKE" : "ASLEEP_UNSPECIFIED"
  }
}
