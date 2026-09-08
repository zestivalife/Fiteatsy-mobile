Pod::Spec.new do |s|
  s.name = 'FiteatsyHealthKit'
  s.version = '1.0.0'
  s.summary = 'Read-only governed HealthKit bridge for Fiteatsy'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Fiteatsy'
  s.homepage = 'https://fiteatsy.com'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
