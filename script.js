document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("place-form");
  const output = document.getElementById("output");
  const crowdChartContainer = document.getElementById("crowd-chart-container");
  let crowdChart = null; // Reference to the Chart instance

  // API keys
  const weatherbitApiKey = "2066a117d6da480ea8a45cd9f7aab0d0"; // Replace with your Weatherbit API key
  const timezoneDbApiKey = "GANIDXDDO6TS"; // Replace with your Time Zone DB API key
  const ticketmasterApiKey = "ZpSEZx6cN9KfLofoWhjZ6AS8eU32Ac5Y"; // Replace with your Ticketmaster API key
  const openCageApiKey = "5be2ad76e9f14569b5f94e17fc3170f8"; // Replace with your OpenCage API key

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const placeName = document.getElementById("place-name").value.trim();

    if (!placeName) {
      output.innerHTML = `<p>Please enter a valid place name.</p>`;
      return;
    }

    output.innerHTML = `<p>Analyzing the best times to visit <strong>${placeName}</strong>...</p>`;
    crowdChartContainer.style.display = "none"; // Hide the chart initially

    try {
      // 1. Fetch location data using OpenCage API
      const coordinates = await getCoordinates(placeName);
      if (!coordinates) {
        output.innerHTML = `<p>Could not find coordinates for "${placeName}". Please try another place.</p>`;
        return;
      }

      const { lat, lon } = coordinates;

      // 2. Fetch time zone data
      const timezoneResponse = await fetch(
        `https://api.timezonedb.com/v2.1/get-time-zone?key=${timezoneDbApiKey}&format=json&by=position&lat=${lat}&lng=${lon}`
      );
      const timezoneData = await timezoneResponse.json();

      if (timezoneData.status !== "OK") {
        output.innerHTML = `<p>Could not retrieve time zone data for "${placeName}". Please try again later.</p>`;
        return;
      }

      const timeZone = timezoneData.zoneName;
      const localTime = timezoneData.formatted;

      // 3. Fetch current weather data
      const currentWeatherResponse = await fetch(
        `https://api.weatherbit.io/v2.0/current?lat=${lat}&lon=${lon}&key=${weatherbitApiKey}`
      );
      const currentWeatherData = await currentWeatherResponse.json();

      if (!currentWeatherData.data) {
        output.innerHTML = `<p>Could not find weather data for "${placeName}". Please try another place.</p>`;
        return;
      }

      const currentWeather = currentWeatherData.data[0];
      const currentTemp = currentWeather.temp;
      const currentCondition = currentWeather.weather.description;

      // 4. Fetch daily forecast data
      const forecastResponse = await fetch(
        `https://api.weatherbit.io/v2.0/forecast/daily?lat=${lat}&lon=${lon}&key=${weatherbitApiKey}`
      );
      const forecastData = await forecastResponse.json();

      if (!forecastData.data) {
        output.innerHTML = `<p>Could not find forecast data for "${placeName}". Please try another place.</p>`;
        return;
      }

      const dailyForecast = forecastData.data;

      // 5. Analyze the best time and months
      const bestMonths = getBestMonths(dailyForecast);
      const aiReport = analyzeBestTime(currentWeather, dailyForecast);

      // 6. Generate crowd data and create the chart
      const crowdData = generateDynamicCrowdData(placeName);
      createCrowdChart(crowdData);

      // 7. Fetch events from Ticketmaster
      const events = await fetchEventsFromTicketmaster(placeName);

      // 8. Fetch nearby places
      const nearbyPlaces = await fetchNearbyPlaces(lat, lon);

      // 9. Display results
      output.innerHTML = `
        <h3>Best Time to Visit "${placeName}"</h3>
        <p><strong>AI-Based Report:</strong> ${aiReport}</p>
        <p><strong>Best Months:</strong> ${
          bestMonths.length > 0
            ? bestMonths.join(", ")
            : "No suitable months found based on weather."
        }</p>
        <p><strong>Current Weather:</strong> ${currentTemp}°C, ${currentCondition}</p>
        <p><strong>Time Zone:</strong> ${timeZone}</p>
        <p><strong>Local Time:</strong> ${localTime}</p>
      `;

      if (events.length > 0) {
        output.innerHTML += `<h3>Upcoming Events</h3><ul>${events
          .map(
            (event) =>
              `<li><strong>${event.name}</strong> - ${event.dates.start.localDate}</li>`
          )
          .join("")}</ul>`;
      } else {
        output.innerHTML += "<p>No upcoming events found.</p>";
      }

      // Display nearby tourist places if any
      if (nearbyPlaces.length > 0) {
        output.innerHTML += `<h3>Nearby Tourist Places</h3><ul>${nearbyPlaces
          .map(
            (place) =>
              `<li><strong>${place.name}</strong> (${place.category}) - ${place.address}</li>`
          )
          .join("")}</ul>`;
      } else {
        output.innerHTML += "<p>No nearby tourist places found.</p>";
      }

      crowdChartContainer.style.display = "block"; // Show the chart after data is ready
    } catch (error) {
      console.error("Error:", error);
      output.innerHTML = `<p>An error occurred while fetching data. Please try again later.</p>`;
    }
  });

  // Function to get coordinates using OpenCage Geocoding API
  async function getCoordinates(placeName) {
    try {
      const response = await fetch(
        `https://api.opencagedata.com/geocode/v1/json?q=${placeName}&key=${openCageApiKey}`
      );
      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        return null;
      }

      const lat = data.results[0].geometry.lat;
      const lon = data.results[0].geometry.lng;

      return { lat, lon };
    } catch (error) {
      console.error("Error fetching coordinates:", error);
      return null;
    }
  }

  // Function to fetch nearby places using Geoapify API
  async function fetchNearbyPlaces(lat, lon) {
    try {
      const response = await fetch(
        `https://api.geoapify.com/v2/places?categories=tourism,landmarks,parks&bias=proximity:${lat},${lon}&radius=10000&apiKey=${openCageApiKey}`
      );
      const data = await response.json();

      console.log("Nearby places API response:", data); // Log the response to debug

      if (!data.features || data.features.length === 0) {
        return [];
      }

      // Extract relevant data from the API response
      return data.features.map((place) => ({
        name: place.properties.name,
        category: place.properties.categories
          ? place.properties.categories[0]
          : "Unknown",
        address: place.properties.address || "No address available",
      }));
    } catch (error) {
      console.error("Error fetching nearby places:", error);
      return [];
    }
  }

  function getBestMonths(forecastData) {
    const bestMonths = [];
    forecastData.forEach((day) => {
      const temp = day.max_temp;
      const precipitation = day.precip;
      if (temp >= 20 && temp <= 30 && precipitation <= 50) {
        const month = new Date(day.valid_date).toLocaleString("default", {
          month: "long",
        });
        if (!bestMonths.includes(month)) {
          bestMonths.push(month);
        }
      }
    });
    return bestMonths;
  }

  function analyzeBestTime(currentWeather) {
    const temp = currentWeather.temp;
    const condition = currentWeather.weather.description.toLowerCase();
    if (temp > 30 || condition.includes("rain")) {
      return "Evening is the best time due to cooler temperatures.";
    } else if (temp < 20) {
      return "Afternoon is ideal due to warmer weather.";
    } else {
      return "Morning is recommended for pleasant weather and fewer crowds.";
    }
  }

  function generateDynamicCrowdData() {
    return Array.from({ length: 7 }, () =>
      Math.floor(Math.random() * 500 + 100)
    );
  }

  function createCrowdChart(crowdData) {
    if (crowdChart) {
      crowdChart.destroy(); // Destroy existing chart before creating a new one
    }
    const ctx = document.getElementById("crowd-chart").getContext("2d");
    crowdChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        datasets: [
          {
            label: "Crowd size (in number of people)",
            data: crowdData,
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            borderColor: "rgba(75, 192, 192, 1)",
            borderWidth: 1,
          },
        ],
      },
    });
  }

  async function fetchEventsFromTicketmaster(placeName) {
    try {
      const response = await fetch(
        `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${ticketmasterApiKey}&city=${placeName}`
      );
      const data = await response.json();
      return data._embedded?.events || [];
    } catch (error) {
      console.error("Error fetching events:", error);
      return [];
    }
  }
});
