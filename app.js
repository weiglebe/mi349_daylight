'use strict';

// Daylight uses native Fetch and ordinary DOM updates. No framework or API key.
const $ = (id) => document.getElementById(id);
let unit = 'F';
let forecast = null;
let place = { name: 'East Lansing', admin1: 'Michigan', country: 'United States', latitude: 42.73698, longitude: -84.48387 };
let forecastRequest = 0;
let searchRequest = 0;
let forecastController;
let searchController;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const rounded = (value, suffix = '') => finite(value) ? `${Math.round(value)}${suffix}` : 'Unavailable';
const temperature = (value) => finite(value) ? `${Math.round(unit === 'F' ? value * 9 / 5 + 32 : value)}°` : '—';
const wind = (value) => finite(value) ? `${Math.round(unit === 'F' ? value / 1.609344 : value)} ${unit === 'F' ? 'mph' : 'km/h'}` : 'Unavailable';
const placeName = (value) => [...new Set([value.name, value.admin1, value.country].filter(Boolean))].join(', ');

// Treat API dates as city-local wall times, rather than the visitor's time zone.
function clock(value) {
  if (typeof value !== 'string' || !value.includes('T')) return 'Unavailable';
  const [hour, minute] = value.split('T')[1].split(':').map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function dateLabel(value, options) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}
function condition(code) {
  if (code === 0) return ['Clear sky', '☀'];
  if (code === 1) return ['Mostly clear', '☀'];
  if (code === 2) return ['Partly cloudy', '☁'];
  if (code === 3) return ['Overcast', '☁'];
  if ([45, 48].includes(code)) return ['Fog', '≋'];
  if ([51, 53, 55].includes(code)) return ['Drizzle', '☂'];
  if ([56, 57, 66, 67].includes(code)) return ['Freezing precipitation', '☂'];
  if ([61, 63, 65, 80, 81, 82].includes(code)) return ['Rain', '☂'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snow', '❄'];
  if ([95, 96, 99].includes(code)) return ['Thunderstorms', 'ϟ'];
  return ['Conditions unavailable', '—'];
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// HTTP failures, network errors, and slow responses all reach the visible error state.
async function fetchJSON(url, controller) {
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error('The data service rejected the request.');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
function validateForecast(data) {
  if (!data.current || typeof data.current.time !== 'string' || !data.daily || !data.hourly || !data.timezone) throw new Error('Incomplete forecast');
  const groups = {
    daily: ['time', 'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'sunset'],
    hourly: ['time', 'temperature_2m', 'precipitation_probability', 'wind_speed_10m', 'weather_code', 'is_day']
  };
  for (const [group, fields] of Object.entries(groups)) {
    if (!fields.every((field) => Array.isArray(data[group][field]) && data[group][field].length === data[group].time.length) || !data[group].time.length) throw new Error('Incomplete forecast');
  }
}
async function loadWeather(nextPlace) {
  const request = ++forecastRequest;
  forecastController?.abort();
  forecastController = new AbortController();
  $('status').className = '';
  $('status').textContent = `Loading weather for ${nextPlace.name}…`;
  $('retry').hidden = true;
  $('weather').hidden = true;
  $('location').textContent = placeName(nextPlace);
  $('updated').textContent = 'Requesting a fresh forecast';
  place = nextPlace;
  const params = new URLSearchParams({
    latitude: nextPlace.latitude, longitude: nextPlace.longitude,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset',
    timezone: 'auto', forecast_days: '7', temperature_unit: 'celsius', wind_speed_unit: 'kmh'
  });
  try {
    const data = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`, forecastController);
    if (request !== forecastRequest) return; // Ignore superseded responses.
    validateForecast(data);
    forecast = data;
    renderWeather();
    $('weather').hidden = false;
    $('status').textContent = 'Forecast ready. Find a little time outside.';
    $('updated').textContent = `As of ${clock(data.current.time)} · ${data.timezone.replaceAll('_', ' ')}`;
  } catch (error) {
    if (request !== forecastRequest) return;
    forecast = null;
    $('status').className = 'error-note';
    $('status').textContent = 'Weather could not load. Check your connection and try again.';
    $('updated').textContent = 'Forecast unavailable';
    $('retry').hidden = false;
    console.warn('Weather request did not complete:', error.message);
  }
}
function renderWeather() {
  if (!forecast) return;
  const { current, daily, hourly } = forecast;
  $('temperature').textContent = `${temperature(current.temperature_2m)}${unit}`;
  $('condition').textContent = condition(current.weather_code)[0];
  $('feels').textContent = `Feels like ${temperature(current.apparent_temperature)}${unit}`;
  $('wind').textContent = wind(current.wind_speed_10m);
  $('humidity').textContent = rounded(current.relative_humidity_2m, '%');
  $('high-low').textContent = `${temperature(daily.temperature_2m_max[0])} / ${temperature(daily.temperature_2m_min[0])}`;
  $('sunset').textContent = `Sunset today: ${clock(daily.sunset[0])}. All times are city-local.`;
  renderWindow();
  // Start at the first full forecast hour at or after the current model time.
  const first = hourly.time.findIndex((time) => time >= current.time);
  $('hourly').replaceChildren();
  if (first < 0) $('hourly').append(node('li', '', 'Hourly forecast unavailable.'));
  else for (let i = first; i < Math.min(first + 12, hourly.time.length); i++) {
    const item = node('li');
    const time = node('time', 'hour-time', clock(hourly.time[i]));
    time.dateTime = hourly.time[i];
    time.title = hourly.time[i].replace('T', ' ');
    const track = node('div', 'rain-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = node('div', 'rain-fill');
    fill.style.height = `${finite(hourly.precipitation_probability[i]) ? Math.max(0, Math.min(100, hourly.precipitation_probability[i])) : 0}%`;
    track.append(fill);
    const rain = node('span', 'rain-label', rounded(hourly.precipitation_probability[i], '%'));
    rain.prepend(node('span', 'sr-only', 'Precipitation chance: '));
    item.append(time, node('span', 'hour-temp', temperature(hourly.temperature_2m[i])), track, rain);
    $('hourly').append(item);
  }
  $('daily').replaceChildren();
  daily.time.slice(0, 7).forEach((day, i) => {
    const item = node('li');
    const [description, symbol] = condition(daily.weather_code[i]);
    const icon = node('span', 'day-symbol', symbol);
    icon.setAttribute('aria-hidden', 'true');
    const range = node('span', 'day-range');
    const low = node('span', '', temperature(daily.temperature_2m_min[i]));
    low.prepend(node('span', 'sr-only', ', low '));
    range.append(node('span', 'sr-only', 'High '), document.createTextNode(temperature(daily.temperature_2m_max[i])), low);
    item.append(node('span', 'day-name', i === 0 ? 'Today' : dateLabel(day, { weekday: 'short' })), node('span', 'day-date', dateLabel(day, { month: 'short', day: 'numeric' })), icon, node('p', 'day-condition', description), range, node('span', 'day-rain', `${rounded(daily.precipitation_probability_max[i], '%')} precip.`));
    $('daily').append(item);
  });
}
function renderWindow() {
  const { hourly, current } = forecast;
  const today = current.time.slice(0, 10);
  const candidates = hourly.time.map((time, i) => ({ time, i })).filter(({ time, i }) =>
    time.startsWith(today) && time >= current.time && hourly.is_day[i] === 1 &&
    [hourly.temperature_2m[i], hourly.precipitation_probability[i], hourly.wind_speed_10m[i], hourly.weather_code[i]].every(finite)
  );
  const score = (i) => Math.abs(hourly.temperature_2m[i] - 20) * 2 + hourly.precipitation_probability[i] + hourly.wind_speed_10m[i] * 1.5 + (hourly.weather_code[i] >= 95 ? 200 : 0);
  candidates.sort((a, b) => score(a.i) - score(b.i));
  if (!candidates.length) {
    $('window-label').textContent = 'LOOK AHEAD';
    $('window-time').textContent = 'A fresh start tomorrow.';
    $('window-copy').textContent = 'No remaining daylight forecast hours are available today. Take a look at the week ahead and plan your next outing.';
    return;
  }
  const { time, i } = candidates[0];
  const temp = hourly.temperature_2m[i];
  const rain = hourly.precipitation_probability[i];
  const speed = hourly.wind_speed_10m[i];
  const rough = rain >= 50 || speed > 30 || temp < 5 || temp > 32 || hourly.weather_code[i] >= 95;
  $('window-label').textContent = rough ? 'TODAY MAY CALL FOR AN INDOOR PLAN' : 'BEST REMAINING DAYLIGHT HOUR';
  $('window-time').textContent = rough ? 'Keep it flexible.' : clock(time);
  $('window-copy').textContent = `${rough ? `Even the best remaining hour (${clock(time)}) looks less comfortable. ` : 'A little room to step away. '}Forecast: ${temperature(temp)}${unit}, ${rain}% precipitation chance, and ${wind(speed)} wind.`;
}
$('search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('city').value.trim();
  if (query.length < 2) {
    $('search-status').textContent = 'Enter at least two characters.';
    return;
  }
  const request = ++searchRequest;
  searchController?.abort();
  searchController = new AbortController();
  $('search-results').replaceChildren();
  $('search-status').textContent = 'Looking for matching cities…';
  const params = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' });
  try {
    const data = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`, searchController);
    if (request !== searchRequest) return;
    const results = (data.results || []).filter((result) => finite(result.latitude) && finite(result.longitude));
    $('search-status').textContent = results.length ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}. Choose a city below.` : 'No cities found. Try another spelling or a nearby city.';
    for (const result of results) {
      const item = node('li');
      const button = node('button', '', placeName(result));
      button.type = 'button';
      button.addEventListener('click', () => {
        $('search-results').replaceChildren();
        $('search-status').textContent = `Selected ${placeName(result)}.`;
        $('city').value = result.name;
        $('city').focus();
        loadWeather(result);
      });
      item.append(button);
      $('search-results').append(item);
    }
  } catch (error) {
    if (request !== searchRequest) return;
    $('search-status').textContent = 'City search could not load. Check your connection and search again.';
    console.warn('City search did not complete:', error.message);
  }
});
function setUnit(nextUnit) {
  unit = nextUnit;
  $('fahrenheit').setAttribute('aria-pressed', String(unit === 'F'));
  $('celsius').setAttribute('aria-pressed', String(unit === 'C'));
  renderWeather();
}
$('fahrenheit').addEventListener('click', () => setUnit('F'));
$('celsius').addEventListener('click', () => setUnit('C'));
$('retry').addEventListener('click', () => loadWeather(place));
loadWeather(place);
