// Config plugin Expo : corrige automatiquement le Podfile généré par
// `expo prebuild` pour permettre un build Mac Catalyst.
// Sans ce plugin, chaque `expo prebuild` régénère ios/Podfile et efface
// toute correction manuelle (MACOSX_DEPLOYMENT_TARGET, mac_catalyst_enabled).
const { withPodfile } = require('@expo/config-plugins');

const withMacCatalystFixes = (config) => {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    // 1) Active le support Mac Catalyst dans react_native_post_install
    contents = contents.replace(
      /:mac_catalyst_enabled\s*=>\s*false/,
      ':mac_catalyst_enabled => true'
    );

    // 2) Force MACOSX_DEPLOYMENT_TARGET à 12.0 sur tous les targets Pods
    //    (les libs React Native sont générées avec 10.15 par défaut, qui
    //    n'est plus supporté par les SDK Xcode récents : min 12.0)
    const deploymentTargetFix = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['MACOSX_DEPLOYMENT_TARGET'] = '12.0'
      end
    end`;

    if (!contents.includes("MACOSX_DEPLOYMENT_TARGET'] = '12.0'")) {
      contents = contents.replace(
        /(react_native_post_install\(\s*[\s\S]*?\n\s*\))/,
        `$1\n${deploymentTargetFix}\n    installer.pods_project.build_configurations.each do |build_config|\n      build_config.build_settings['MACOSX_DEPLOYMENT_TARGET'] = '12.0'\n    end`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = withMacCatalystFixes;
