import fs from 'fs';
let code = fs.readFileSync('server.js', 'utf8');

// Update saveState()
if (!code.includes('delete safeAppConfig.solanaTrackerApiKey;')) {
    code = code.replace(
      'delete safeAppConfig.twitterBearerToken;',
      'delete safeAppConfig.twitterBearerToken;\n    delete safeAppConfig.solanaTrackerApiKey;'
    );
}

// Update GET /api/config
if (!code.includes('delete safeConfig.solanaTrackerApiKey;')) {
    code = code.replace(
      'delete safeConfig.twitterBearerToken;',
      'delete safeConfig.twitterBearerToken;\n  delete safeConfig.solanaTrackerApiKey;'
    );
}

// Update POST /api/config
if (!code.includes('solanaTrackerApiKey } = req.body;')) {
    code = code.replace(
      'dextoolsApiKey, twitterBearerToken, safetyCheckEnabled, useJitoBundle } = req.body;',
      'dextoolsApiKey, twitterBearerToken, solanaTrackerApiKey, safetyCheckEnabled, useJitoBundle } = req.body;'
    );
}

if (!code.includes('if(solanaTrackerApiKey !== undefined) appConfig.solanaTrackerApiKey = solanaTrackerApiKey;')) {
    code = code.replace(
      'if(twitterBearerToken !== undefined) appConfig.twitterBearerToken = twitterBearerToken;',
      'if(twitterBearerToken !== undefined) appConfig.twitterBearerToken = twitterBearerToken;\n  if(solanaTrackerApiKey !== undefined) appConfig.solanaTrackerApiKey = solanaTrackerApiKey;'
    );
}

fs.writeFileSync('server.js', code);
