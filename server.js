const express = require('express');
const Database = require('better-sqlite3');
const UAParser = require('ua-parser-js');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// --- Admin credentials (change these!) ---
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'changeme123';

// --- Database setup ---
const db = new Database(path.join(__dirname, 'visitors.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT,
    ip TEXT,
    city TEXT,
    region TEXT,
    country TEXT,
    country_code TEXT,
    latitude REAL,
    longitude REAL,
    timezone TEXT,
    isp TEXT,
    org TEXT,
    as_info TEXT,
    browser TEXT,
    browser_version TEXT,
    os TEXT,
    os_version TEXT,
    device_type TEXT,
    device_vendor TEXT,
    device_model TEXT,
    screen_width INTEGER,
    screen_height INTEGER,
    viewport_width INTEGER,
    viewport_height INTEGER,
    color_depth INTEGER,
    pixel_ratio REAL,
    language TEXT,
    languages TEXT,
    platform TEXT,
    referrer TEXT,
    page_url TEXT,
    connection_type TEXT,
    do_not_track TEXT,
    cookie_enabled INTEGER,
    touch_support INTEGER,
    max_touch_points INTEGER,
    hardware_concurrency INTEGER,
    device_memory REAL,
    battery_level REAL,
    battery_charging INTEGER,
    visited_at TEXT DEFAULT (datetime('now')),
    user_agent TEXT
  )
`);

const insertVisitor = db.prepare(`
  INSERT INTO visitors (
    visitor_id, ip, city, region, country, country_code,
    latitude, longitude, timezone, isp, org, as_info,
    browser, browser_version, os, os_version,
    device_type, device_vendor, device_model,
    screen_width, screen_height, viewport_width, viewport_height,
    color_depth, pixel_ratio, language, languages, platform,
    referrer, page_url, connection_type, do_not_track,
    cookie_enabled, touch_support, max_touch_points,
    hardware_concurrency, device_memory, battery_level, battery_charging,
    user_agent
  ) VALUES (
    @visitor_id, @ip, @city, @region, @country, @country_code,
    @latitude, @longitude, @timezone, @isp, @org, @as_info,
    @browser, @browser_version, @os, @os_version,
    @device_type, @device_vendor, @device_model,
    @screen_width, @screen_height, @viewport_width, @viewport_height,
    @color_depth, @pixel_ratio, @language, @languages, @platform,
    @referrer, @page_url, @connection_type, @do_not_track,
    @cookie_enabled, @touch_support, @max_touch_points,
    @hardware_concurrency, @device_memory, @battery_level, @battery_charging,
    @user_agent
  )
`);

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy for real IP behind reverse proxies
app.set('trust proxy', true);

// --- Helper: Get real IP ---
function getRealIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.ip
    || '0.0.0.0';
}

// --- Helper: Fetch geolocation from IP ---
async function getGeoFromIP(ip) {
  // Skip local/private IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '0.0.0.0') {
    return {
      city: 'Local', region: 'Local', country: 'Local',
      countryCode: 'LO', lat: 0, lon: 0, timezone: 'N/A',
      isp: 'Local', org: 'Local', as: 'Local'
    };
  }
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as`);
    const data = await response.json();
    if (data.status === 'success') {
      return {
        city: data.city, region: data.regionName, country: data.country,
        countryCode: data.countryCode, lat: data.lat, lon: data.lon,
        timezone: data.timezone, isp: data.isp, org: data.org, as: data.as
      };
    }
  } catch (e) {
    console.error('Geo lookup failed:', e.message);
  }
  return {
    city: 'Unknown', region: 'Unknown', country: 'Unknown',
    countryCode: '??', lat: 0, lon: 0, timezone: 'Unknown',
    isp: 'Unknown', org: 'Unknown', as: 'Unknown'
  };
}

// --- Route: Landing page ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Route: Collect visitor data ---
app.post('/api/track', async (req, res) => {
  try {
    const ip = getRealIP(req);
    const ua = req.headers['user-agent'] || '';
    const parser = new UAParser(ua);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    const geo = await getGeoFromIP(ip);
    const clientData = req.body || {};

    const visitorId = crypto.createHash('sha256')
      .update(ip + ua + new Date().toDateString())
      .digest('hex').substring(0, 16);

    insertVisitor.run({
      visitor_id: visitorId,
      ip: ip,
      city: geo.city || null,
      region: geo.region || null,
      country: geo.country || null,
      country_code: geo.countryCode || null,
      latitude: geo.lat || null,
      longitude: geo.lon || null,
      timezone: geo.timezone || null,
      isp: geo.isp || null,
      org: geo.org || null,
      as_info: geo.as || null,
      browser: browser.name || null,
      browser_version: browser.version || null,
      os: os.name || null,
      os_version: os.version || null,
      device_type: device.type || 'desktop',
      device_vendor: device.vendor || null,
      device_model: device.model || null,
      screen_width: clientData.screenWidth || null,
      screen_height: clientData.screenHeight || null,
      viewport_width: clientData.viewportWidth || null,
      viewport_height: clientData.viewportHeight || null,
      color_depth: clientData.colorDepth || null,
      pixel_ratio: clientData.pixelRatio || null,
      language: clientData.language || null,
      languages: clientData.languages || null,
      platform: clientData.platform || null,
      referrer: clientData.referrer || req.headers['referer'] || null,
      page_url: clientData.pageUrl || null,
      connection_type: clientData.connectionType || null,
      do_not_track: clientData.doNotTrack || null,
      cookie_enabled: clientData.cookieEnabled ? 1 : 0,
      touch_support: clientData.touchSupport ? 1 : 0,
      max_touch_points: clientData.maxTouchPoints || null,
      hardware_concurrency: clientData.hardwareConcurrency || null,
      device_memory: clientData.deviceMemory || null,
      battery_level: clientData.batteryLevel || null,
      battery_charging: clientData.batteryCharging != null ? (clientData.batteryCharging ? 1 : 0) : null,
      user_agent: ua
    });

    res.json({ status: 'ok', vid: visitorId });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ status: 'error' });
  }
});

// --- Basic Auth middleware for admin ---
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
    return res.status(401).send('Authentication required');
  }
  const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [user, pass] = decoded.split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
  return res.status(401).send('Invalid credentials');
}

// --- Route: Admin dashboard ---
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Route: Admin API - get visitors ---
app.get('/api/visitors', adminAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let whereClause = '';
  let params = {};
  if (search) {
    whereClause = `WHERE ip LIKE @search OR city LIKE @search OR country LIKE @search 
                    OR browser LIKE @search OR os LIKE @search OR isp LIKE @search`;
    params.search = `%${search}%`;
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM visitors ${whereClause}`).get(params).count;
  const visitors = db.prepare(`SELECT * FROM visitors ${whereClause} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });

  res.json({ visitors, total, page, pages: Math.ceil(total / limit) });
});

// --- Route: Admin API - stats ---
app.get('/api/stats', adminAuth, (req, res) => {
  const totalVisitors = db.prepare('SELECT COUNT(*) as count FROM visitors').get().count;
  const uniqueIPs = db.prepare('SELECT COUNT(DISTINCT ip) as count FROM visitors').get().count;
  const todayVisitors = db.prepare(`SELECT COUNT(*) as count FROM visitors WHERE date(visited_at) = date('now')`).get().count;

  const topCountries = db.prepare(`
    SELECT country, country_code, COUNT(*) as count FROM visitors 
    WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10
  `).all();

  const topCities = db.prepare(`
    SELECT city, country_code, COUNT(*) as count FROM visitors 
    WHERE city IS NOT NULL GROUP BY city ORDER BY count DESC LIMIT 10
  `).all();

  const topBrowsers = db.prepare(`
    SELECT browser, COUNT(*) as count FROM visitors 
    WHERE browser IS NOT NULL GROUP BY browser ORDER BY count DESC LIMIT 10
  `).all();

  const topOS = db.prepare(`
    SELECT os, COUNT(*) as count FROM visitors 
    WHERE os IS NOT NULL GROUP BY os ORDER BY count DESC LIMIT 10
  `).all();

  const topDeviceTypes = db.prepare(`
    SELECT device_type, COUNT(*) as count FROM visitors 
    GROUP BY device_type ORDER BY count DESC
  `).all();

  const recentVisitors = db.prepare(`SELECT * FROM visitors ORDER BY id DESC LIMIT 10`).all();

  const dailyVisits = db.prepare(`
    SELECT date(visited_at) as day, COUNT(*) as count 
    FROM visitors GROUP BY day ORDER BY day DESC LIMIT 30
  `).all();

  res.json({
    totalVisitors, uniqueIPs, todayVisitors,
    topCountries, topCities, topBrowsers, topOS, topDeviceTypes,
    recentVisitors, dailyVisits
  });
});

// --- Route: Admin API - export CSV ---
app.get('/api/export', adminAuth, (req, res) => {
  const visitors = db.prepare('SELECT * FROM visitors ORDER BY id DESC').all();

  const headers = Object.keys(visitors[0] || {});
  const csv = [
    headers.join(','),
    ...visitors.map(v => headers.map(h => `"${(v[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=visitors_export.csv');
  res.send(csv);
});

// --- Route: Admin API - delete visitor ---
app.delete('/api/visitors/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM visitors WHERE id = ?').run(req.params.id);
  res.json({ status: 'deleted' });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n🟢 Tracker running at http://localhost:${PORT}`);
  console.log(`📊 Admin dashboard at http://localhost:${PORT}/admin`);
  console.log(`   Username: ${ADMIN_USER}`);
  console.log(`   Password: ${ADMIN_PASS}`);
  console.log(`\n⚠️  Change ADMIN_USER and ADMIN_PASS in server.js before deploying!\n`);
});

