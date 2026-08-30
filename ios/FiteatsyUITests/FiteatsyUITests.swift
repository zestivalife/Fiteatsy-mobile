import XCTest

final class FiteatsyUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments += ["-FITEATSY_UI_TESTING", "1"]
  }

  private func attachScreenshot(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func waitForAnyRoot(timeout: TimeInterval = 30) -> XCUIElement {
    let identifiers = [
      "onboarding.progress", "ready.root", "home.root", "tracker.root",
      "reports.root", "nutrition.root", "medication.root", "healthConnect.root",
      "auth.signIn.root", "auth.signUp.root"
    ]
    for identifier in identifiers {
      let element = app.descendants(matching: .any)[identifier]
      if element.waitForExistence(timeout: timeout / Double(identifiers.count)) { return element }
    }
    XCTFail("No canonical Fiteatsy root became available")
    return app
  }

  private func assertNoRuntimeFailure() {
    let forbiddenMessages = [
      "Unable to load script", "No bundle URL present", "Invariant Violation",
      "TypeError:", "ReferenceError:", "React Native Error"
    ]
    for message in forbiddenMessages {
      XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", message)).firstMatch.exists)
    }
  }

  private func waitForForeground(timeout: TimeInterval = 30) {
    let foreground = NSPredicate(format: "state == %d", XCUIApplication.State.runningForeground.rawValue)
    expectation(for: foreground, evaluatedWith: app)
    waitForExpectations(timeout: timeout)
  }

  func testSafeLaunchScreenshotAndRelaunch() throws {
    app.launch()
    waitForForeground()
    assertNoRuntimeFailure()
    attachScreenshot("01-cold-launch")

    app.swipeUp()
    attachScreenshot("02-safe-swipe")
    app.terminate()
    app.launch()
    waitForForeground()
    assertNoRuntimeFailure()
    attachScreenshot("03-relaunch-resume")
  }

  func testGovernedQAFullOnboardingJourney() throws {
    guard ProcessInfo.processInfo.environment["FITEATSY_GOVERNED_QA_TEST_READY"] == "1" else {
      throw XCTSkip("BLOCKED — GOVERNED QA_TEST SESSION REQUIRED")
    }

    app.launch()
    XCTAssertTrue(app.otherElements["onboarding.progress"].waitForExistence(timeout: 30))

    let heightRuler = app.otherElements["height.ruler"]
    XCTAssertTrue(heightRuler.waitForExistence(timeout: 20))
    heightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.72, dy: 0.5))
      .press(forDuration: 0.15, thenDragTo: heightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.5)))
    app.buttons["height.plus"].tap()
    attachScreenshot("10-height-ruler-drag")
    app.buttons["onboarding.continue"].tap()

    let weightRuler = app.otherElements["weight.ruler"]
    XCTAssertTrue(weightRuler.waitForExistence(timeout: 20))
    weightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.68, dy: 0.5))
      .press(forDuration: 0.15, thenDragTo: weightRuler.coordinate(withNormalizedOffset: CGVector(dx: 0.42, dy: 0.5)))
    app.buttons["weight.minus"].tap()
    attachScreenshot("11-weight-ruler-drag")
    app.buttons["onboarding.continue"].tap()

    while app.buttons["onboarding.continue"].waitForExistence(timeout: 2) {
      app.swipeUp()
      app.buttons["onboarding.continue"].tap()
      if app.descendants(matching: .any)["food.save"].exists { break }
    }

    let search = app.textFields["food.avoid.search"]
    if search.waitForExistence(timeout: 10) {
      search.tap()
      search.typeText("mushroom")
      attachScreenshot("12-food-search")
    }
    if app.buttons["food.save"].exists {
      app.buttons["food.save"].tap()
      XCTAssertFalse(app.buttons["food.save"].isEnabled)
    }

    app.terminate()
    app.launch()
    _ = waitForAnyRoot()
    attachScreenshot("13-governed-relaunch")
  }
}
