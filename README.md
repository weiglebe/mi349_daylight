# Daylight Weather App

Daylight is a single-page weather app that helps users check the forecast and find a good time to go outside. I built it using HTML, a separate CSS file, and JavaScript.

## Features

- Search for cities and choose a matching location.
- View current weather, the next 12 hours, and a seven-day forecast.
- Switch between Fahrenheit and Celsius.
- Get a suggested outdoor hour based on temperature, precipitation chance, and wind.
- See loading messages and retry if weather data fails to load.

## Fetch API and Public Data

The app uses JavaScript's `fetch()` API to get data from **Open-Meteo**, which is included in the [Public APIs list under Weather](https://github.com/public-apis/public-apis#weather).

One request gets matching cities from Open-Meteo's geocoding endpoint. After a city is selected, another request uses its coordinates to get weather data. The JSON responses update the page without reloading it. The app also checks for failed requests and displays an error message when needed.

- [Open-Meteo Weather API](https://open-meteo.com/en/docs)
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)

## Semantic Markup and W3C Validation

The HTML uses semantic elements like `<header>`, `<main>`, `<section>`, `<aside>`, and `<footer>` to organize the page. The search input has a label, and headings describe each section.

Both the original HTML and the HTML generated after the forecast loaded passed the **W3C Nu HTML Checker with no errors or warnings**. The app's styling is kept in the separate `styles.css` file.
