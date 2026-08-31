import XCTest

final class FiteatsyUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments += ["-FITEATSY_UI_TESTING", "1"]
  }

  private func element(_ identifier: String) -> XCUIElement {
    app.descendants(matching: .any)[identifier]
  }

  private func attachScreenshot(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  @discardableResult
  private func waitForAnyRoot(timeout: TimeInterval = 30) -> XCUIElement {
    let identifiers = [
      "onboarding.progress", "ready.root", "home.root", "tracker.root",
      "reports.root", "nutrition.root", "medication.root", "care.root",
      "profile.root", "healthConnect.root", "auth.signIn.root", "auth.signUp.root"
    ]
    let matches = app.descendants(matching: .any).matching(NSPredicate(format: "identifier IN %@", identifiers)).firstMatch
    let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true"), object: matches)
    _ = XCTWaiter.wait(for: [expectation], timeout: timeout)
    for identifier in identifiers where element(identifier).exists { return element(identifier) }
    XCTFail("No canonical Fiteatsy root became available")
    return app
  }

  private func assertNoRuntimeFailure(file: StaticString = #filePath, line: UInt = #line) {
    let forbidden = [
      "Unable to load script", "No bundle URL present", "No script URL provided", "Invariant Violation",
      "TypeError:", "ReferenceError:", "React Native Error", "Malformed calls from JS"
    ]
    for message in forbidden {
      XCTAssertFalse(
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", message)).firstMatch.exists,
        "Runtime failure rendered: \(message)", file: file, line: line
      )
    }
  }

  private func assertUsableScreen(_ rootID: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(element(rootID).waitForExistence(timeout: 20), "Missing screen root \(rootID)", file: file, line: line)
    XCTAssertGreaterThan(app.staticTexts.count, 0, "Screen has no readable content", file: file, line: line)
    assertNoRuntimeFailure(file: file, line: line)
  }

  private func waitForForeground(timeout: TimeInterval = 30) {
    let foreground = NSPredicate(format: "state == %d", XCUIApplication.State.runningForeground.rawValue)
    expectation(for: foreground, evaluatedWith: app)
    waitForExpectations(timeout: timeout)
  }

  private func requireAuthenticatedMain() throws {
    app.launch()
    waitForForeground()
    let root = waitForAnyRoot()
    let mainRoots = ["home.root", "tracker.root", "nutrition.root", "care.root", "profile.root"]
    guard mainRoots.contains(root.identifier) else {
      throw XCTSkip("READ-ONLY L4 REQUIRES AN EXISTING AUTHENTICATED MOBILE SESSION")
    }
    assertNoRuntimeFailure()
  }

  private func tapTab(_ label: String, rootID: String, screenshot: String? = nil) {
    let tab = app.buttons[label]
    XCTAssertTrue(tab.waitForExistence(timeout: 12), "Bottom tab \(label) is unavailable")
    tab.tap()
    assertUsableScreen(rootID)
    let selected = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "selected == true"),
      object: app.buttons[label]
    )
    XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 3), .completed,
                   "Bottom tab \(label) did not expose selected state")
    if let screenshot { attachScreenshot(screenshot) }
  }

  private func returnToJourney() {
    if app.buttons["Go back"].exists { app.buttons["Go back"].tap() }
    tapTab("Journey", rootID: "home.root")
  }

  func testSafeLaunchScreenshotAndRelaunch() throws {
    app.launch()
    waitForForeground()
    _ = waitForAnyRoot()
    assertNoRuntimeFailure()
    attachScreenshot("01-cold-launch")
    app.swipeUp()
    attachScreenshot("02-safe-swipe")
    app.terminate()
    app.launch()
    waitForForeground()
    _ = waitForAnyRoot()
    assertNoRuntimeFailure()
    attachScreenshot("03-relaunch-resume")
  }

  func testReadOnlyBottomNavigationAndLifecycle() throws {
    try requireAuthenticatedMain()
    tapTab("Journey", rootID: "home.root", screenshot: "20-home")
    tapTab("Tracker", rootID: "tracker.root", screenshot: "21-tracker")
    tapTab("Nutrition", rootID: "nutrition.root", screenshot: "22-nutrition")
    tapTab("Care", rootID: "care.root", screenshot: "23-care")
    tapTab("Profile", rootID: "profile.root", screenshot: "24-profile")

    for _ in 0..<2 {
      tapTab("Journey", rootID: "home.root")
      tapTab("Tracker", rootID: "tracker.root")
      tapTab("Nutrition", rootID: "nutrition.root")
      tapTab("Care", rootID: "care.root")
      tapTab("Profile", rootID: "profile.root")
    }
    attachScreenshot("25-rapid-tab-switching")

    XCUIDevice.shared.press(.home)
    app.activate()
    waitForForeground()
    _ = waitForAnyRoot()
    assertNoRuntimeFailure()
    attachScreenshot("26-background-foreground")

    app.terminate()
    app.launch()
    waitForForeground()
    _ = waitForAnyRoot()
    assertNoRuntimeFailure()
    attachScreenshot("27-terminate-relaunch")
  }

  func testTrackerHierarchyAndMissingDataTruthfulness() throws {
    try requireAuthenticatedMain()
    tapTab("Tracker", rootID: "tracker.root")
    let health = element("tracker.health")
    XCTAssertTrue(health.waitForExistence(timeout: 10))
    health.tap()
    for (identifier, name) in [
      ("tracker.overview", "30-tracker-overview"),
      ("tracker.activity", "31-tracker-activity"),
      ("tracker.heart", "32-tracker-heart"),
      ("tracker.sleep", "33-tracker-sleep")
    ] {
      let tab = element(identifier)
      XCTAssertTrue(tab.waitForExistence(timeout: 10), "Missing Tracker sub-tab \(identifier)")
      tab.tap()
      let selected = XCTNSPredicateExpectation(
        predicate: NSPredicate(format: "selected == true"),
        object: element(identifier)
      )
      XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 3), .completed,
                     "Tracker sub-tab did not expose selected state: \(identifier)")
      assertUsableScreen("tracker.root")
      attachScreenshot(name)
    }
    let wellness = element("tracker.wellness")
    XCTAssertTrue(wellness.waitForExistence(timeout: 10))
    wellness.tap()
    attachScreenshot("34-tracker-wellness")
    XCTAssertFalse(app.staticTexts["--/100"].exists, "Missing Recovery Core data must not render --/100")
    let recovery = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] 'Recovery Score'")).firstMatch
    if recovery.exists {
      XCTAssertFalse(recovery.label.contains("0 out of 100"), "Missing Recovery Score was coerced to zero")
    }
  }

  func testReportsV2ReadOnlyUploadSheetAndPickerCancellation() throws {
    try requireAuthenticatedMain()
    tapTab("Journey", rootID: "home.root")
    let reports = app.buttons["Health Reports"]
    XCTAssertTrue(reports.waitForExistence(timeout: 12))
    reports.tap()
    assertUsableScreen("reports.root")
    attachScreenshot("40-reports-v2")

    for attempt in 1...3 {
      let upload = element("reports.upload")
      XCTAssertTrue(upload.waitForExistence(timeout: 10), "Reports upload CTA unavailable on attempt \(attempt)")
      upload.tap()
      XCTAssertTrue(app.staticTexts["Add Health Report"].waitForExistence(timeout: 10))
      attachScreenshot("4\(attempt)-reports-upload-sheet")
      app.buttons["Close upload report"].firstMatch.tap()
      XCTAssertFalse(app.staticTexts["Add Health Report"].waitForExistence(timeout: 3))
    }

    element("reports.upload").tap()
    XCTAssertTrue(app.staticTexts["Add Health Report"].waitForExistence(timeout: 10))
    app.buttons["Upload PDF"].tap()
    let cancel = app.buttons["Cancel"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 12), "System document picker did not expose a safe Cancel action")
    cancel.tap()
    XCTAssertTrue(app.staticTexts["Add Health Report"].waitForExistence(timeout: 10))
    attachScreenshot("44-reports-picker-cancelled")
    app.buttons["Close upload report"].firstMatch.tap()
    returnToJourney()
  }

  func testMedicationReadOnlyLeaveAndReturn() throws {
    try requireAuthenticatedMain()
    tapTab("Journey", rootID: "home.root")
    let medication = app.buttons["Open medication logs"]
    if !medication.waitForExistence(timeout: 6) { app.swipeUp() }
    XCTAssertTrue(medication.waitForExistence(timeout: 10), "Medication entry point unavailable")
    medication.tap()
    assertUsableScreen("medication.root")
    attachScreenshot("50-medication-read-only")
    XCTAssertTrue(app.buttons["Go back"].waitForExistence(timeout: 10))
    app.buttons["Go back"].tap()
    assertUsableScreen("home.root")
    attachScreenshot("51-home-after-medication")
  }

  func testHomeRecoveryCoreTruthfulness() throws {
    try requireAuthenticatedMain()
    tapTab("Journey", rootID: "home.root")
    XCTAssertFalse(app.staticTexts["--/100"].exists, "Recovery Core must explain missing inputs instead of rendering --/100")
    XCTAssertTrue(app.buttons["View today's Recovery Core score"].waitForExistence(timeout: 10))
    attachScreenshot("60-recovery-core-truthfulness")
  }

  func testGovernedQAFullOnboardingJourney() throws {
    guard ProcessInfo.processInfo.environment["FITEATSY_GOVERNED_QA_TEST_READY"] == "1" else {
      throw XCTSkip("BLOCKED — GOVERNED QA_TEST SESSION REQUIRED")
    }
    app.launch()
    XCTAssertTrue(element("onboarding.progress").waitForExistence(timeout: 30))

    let heightRuler = element("height.ruler")
    XCTAssertTrue(heightRuler.waitForExistence(timeout: 20))
    heightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.72, dy: 0.5))
      .press(forDuration: 0.15, thenDragTo: heightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.5)))
    app.buttons["height.plus"].tap()
    attachScreenshot("70-height-ruler-drag")
    app.buttons["onboarding.continue"].tap()

    let weightRuler = element("weight.ruler")
    XCTAssertTrue(weightRuler.waitForExistence(timeout: 20))
    weightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.68, dy: 0.5))
      .press(forDuration: 0.15, thenDragTo: weightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.42, dy: 0.5)))
    app.buttons["weight.minus"].tap()
    attachScreenshot("71-weight-ruler-drag")
    app.buttons["onboarding.continue"].tap()

    while app.buttons["onboarding.continue"].waitForExistence(timeout: 2) {
      app.swipeUp()
      app.buttons["onboarding.continue"].tap()
      if element("food.save").exists { break }
    }
    let search = app.textFields["food.avoid.search"]
    if search.waitForExistence(timeout: 10) {
      search.tap()
      search.typeText("mushroom")
      attachScreenshot("72-food-search")
    }
    if app.buttons["food.save"].exists {
      app.buttons["food.save"].doubleTap()
      XCTAssertFalse(app.buttons["food.save"].isEnabled)
    }
    app.terminate()
    app.launch()
    _ = waitForAnyRoot()
    attachScreenshot("73-governed-relaunch")
  }
}
