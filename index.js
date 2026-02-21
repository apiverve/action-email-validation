const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

// Schema cache for the duration of the action run
const schemaCache = new Map();

/**
 * Fetch API schema from APIVerve assets
 */
async function getSchema(api) {
  if (schemaCache.has(api)) {
    core.debug(`Schema cache hit: ${api}`);
    return schemaCache.get(api);
  }

  const url = `https://assets.apiverve.com/schemas/${api}.json`;
  core.debug(`Fetching schema: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unknown API: "${api}". Check available APIs at https://apiverve.com`);
  }

  const schema = await response.json();
  schemaCache.set(api, schema);
  return schema;
}

/**
 * Validate parameters against schema
 */
function validateParams(params, endpoint) {
  const missing = [];
  const parameters = endpoint.parameters || {};

  for (const [name, def] of Object.entries(parameters)) {
    if (def.required && !(name in params)) {
      missing.push(name);
    }
  }

  return missing;
}

/**
 * Find download URL(s) in an object
 * Always prioritizes 'downloadURL' field
 * Returns single URL or array of URLs for APIs with multiple downloads
 */
function findDownloadUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // Priority 1: Direct downloadURL field (most common)
  if (obj.downloadURL && typeof obj.downloadURL === 'string') {
    return obj.downloadURL;
  }

  // Priority 2: Array of items with downloadURL (e.g., crossword, multiple files)
  const urls = [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];

    // Check arrays of objects with downloadURL
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item?.downloadURL) urls.push(item.downloadURL);
      }
    }
    // Check nested object with downloadURL
    else if (val && typeof val === 'object' && val.downloadURL) {
      urls.push(val.downloadURL);
    }
  }

  if (urls.length > 0) {
    return urls.length === 1 ? urls[0] : urls;
  }

  // Priority 3: Fallback to other URL-like fields
  const fallbackKeys = ['imageURL', 'pdfURL', 'fileURL', 'screenshotURL', 'url'];
  for (const key of fallbackKeys) {
    if (obj[key] && typeof obj[key] === 'string' && obj[key].startsWith('http')) {
      return obj[key];
    }
  }

  return null;
}

/**
 * Download file from URL and save to disk
 */
async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const dir = path.dirname(outputPath);

  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, Buffer.from(buffer));
  return outputPath;
}

/**
 * Main action entry point
 */
async function run() {
  const api = core.getInput('api', { required: true });
  const paramsInput = core.getInput('params') || '{}';
  const outputFile = core.getInput('output_file');
  const failOnError = core.getInput('fail_on_error') !== 'false';
  const format = core.getInput('format') || 'json';

  // Validate format
  const formatMap = {
    'json': 'application/json',
    'yaml': 'application/yaml',
    'xml': 'application/xml'
  };

  if (!formatMap[format]) {
    core.setFailed(`Invalid format: ${format}. Must be json, yaml, or xml.`);
    return;
  }

  // API key: check input first, then env var
  let apiKey = core.getInput('api_key');
  if (!apiKey) {
    apiKey = process.env.APIVERVE_API_KEY || process.env.APIVERVE_KEY;
  }

  if (!apiKey) {
    core.setFailed('API key is required. Set api_key input or APIVERVE_API_KEY environment variable.');
    return;
  }

  // Mask API key in all logs
  core.setSecret(apiKey);

  let params;
  try {
    params = JSON.parse(paramsInput);
  } catch (e) {
    core.setFailed(`Invalid JSON in params: ${e.message}`);
    return;
  }

  try {
    // Fetch and validate schema
    core.startGroup(`Preparing API call: ${api}`);

    const schema = await getSchema(api);
    const endpoint = schema.endpoints?.[0];

    if (!endpoint) {
      throw new Error(`No endpoint found for API: ${api}`);
    }

    const method = endpoint.method || 'GET';
    core.info(`API: ${schema.title || api}`);
    core.info(`Method: ${method}`);
    core.info(`Parameters: ${JSON.stringify(params)}`);

    // Validate required parameters
    const missing = validateParams(params, endpoint);
    if (missing.length > 0) {
      const paramDocs = missing.map(name => {
        const def = endpoint.parameters[name];
        return `  - ${name}: ${def.description || 'No description'}${def.example ? ` (e.g., "${def.example}")` : ''}`;
      }).join('\n');

      core.error(`Missing required parameters:\n${paramDocs}`);
      core.setFailed(`Missing required parameters: ${missing.join(', ')}`);
      return;
    }

    core.endGroup();

    // Make API call
    core.startGroup('Calling APIVerve');
    const startTime = Date.now();

    const url = new URL(`https://api.apiverve.com/v1/${api}`);
    const options = {
      method,
      headers: {
        'x-api-key': apiKey,
        'Accept': formatMap[format],
        'User-Agent': 'APIVerve-GitHub-Action/0.1'
      }
    };

    if (format !== 'json') {
      core.info(`Response format: ${format}`);
    }

    if (method === 'GET') {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(params);
    }

    core.debug(`Request URL: ${url.toString()}`);
    const response = await fetch(url, options);
    const elapsed = Date.now() - startTime;

    core.info(`Status: ${response.status}`);
    core.info(`Time: ${elapsed}ms`);
    core.endGroup();

    // Parse response based on format
    let data;
    let rawResponse;

    if (format === 'json') {
      data = await response.json();
      rawResponse = JSON.stringify(data);
      core.debug(`Response: ${rawResponse}`);
    } else {
      // YAML or XML - store as raw text
      rawResponse = await response.text();
      core.debug(`Response (${format}): ${rawResponse.substring(0, 500)}...`);
      // Try to detect errors from the raw response
      data = { status: response.ok ? 'ok' : 'error' };
    }

    // Check for errors
    const hasError = !response.ok || data.status === 'error';
    if (hasError) {
      const errorMsg = data.error || data.message || `API returned status ${response.status}`;
      core.error(`API Error: ${errorMsg}`);

      if (failOnError) {
        core.setFailed(errorMsg);
        return;
      }
    }

    // Set outputs
    core.setOutput('result', rawResponse);
    core.setOutput('status', data.status || 'ok');

    if (format === 'json' && data.data) {
      core.setOutput('data', JSON.stringify(data.data));
    }

    // Handle file output (for QR codes, screenshots, PDFs, etc.)
    // Only works with JSON format
    if (outputFile && format === 'json' && data.data) {
      const fileUrls = findDownloadUrl(data.data);

      if (fileUrls) {
        core.startGroup('Downloading file(s)');

        // Handle single URL or array of URLs
        const urls = Array.isArray(fileUrls) ? fileUrls : [fileUrls];
        const downloadedFiles = [];

        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          // For multiple files, append index to filename
          let destPath = outputFile;
          if (urls.length > 1) {
            const ext = path.extname(outputFile);
            const base = outputFile.slice(0, -ext.length || undefined);
            destPath = `${base}_${i + 1}${ext || ''}`;
          }

          core.info(`Downloading: ${url}`);
          core.info(`  → ${destPath}`);

          await downloadFile(url, destPath);
          downloadedFiles.push(destPath);
        }

        core.setOutput('file', downloadedFiles.length === 1 ? downloadedFiles[0] : downloadedFiles.join(','));
        core.info(`Downloaded ${downloadedFiles.length} file(s)`);
        core.endGroup();
      } else {
        core.warning('output_file specified but no download URL found in response');
        core.debug(`Response data keys: ${Object.keys(data.data).join(', ')}`);
      }
    } else if (outputFile && format !== 'json') {
      core.warning('output_file requires format=json to download files');
    }

    // Write job summary
    const { summary } = core;
    await summary
      .addHeading(`APIVerve: ${schema.title || api}`, 3)
      .addTable([
        [
          { data: 'Status', header: true },
          { data: 'Time', header: true },
          { data: 'API', header: true }
        ],
        [
          data.status === 'ok' ? '✅ Success' : '❌ Error',
          `${elapsed}ms`,
          `<a href="https://apiverve.com/api/${api}?utm_source=github&utm_medium=action&utm_campaign=summary">${api}</a>`
        ]
      ])
      .write();

    if (data.status === 'ok') {
      core.notice(`✓ ${schema.title || api} completed in ${elapsed}ms`);
    }

  } catch (error) {
    core.error(`Action failed: ${error.message}`);
    core.setFailed(error.message);
  }
}

run();
