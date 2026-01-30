// ===============================
// Surfers For Autism - PWA App.js
// Clean Rebuild
// ===============================

document.addEventListener("DOMContentLoaded", () => {

  // -------------------------------
  // CONFIG
  // -------------------------------
  const API_URL = "http://localhost:8000";
  const STAFF_PIN = "1234"; // change later

  // -------------------------------
  // DOM ELEMENTS
  // -------------------------------
  const loginSection = document.getElementById("login-section");
  const eventSection = document.getElementById("event-section");

  const loginButton = document.getElementById("loginButton");
  const staffPinInput = document.getElementById("staffPin");
  const loginStatus = document.getElementById("login-status");

  const eventSelect = document.getElementById("eventSelect");
  const attendeeInput = document.getElementById("attendeeName");
  const checkinButton = document.getElementById("checkinButton");

  const statusDiv = document.getElementById("status");
  const countDiv = document.getElementById("checkin-count");

  // Safety check
  if (!loginButton || !eventSelect || !checkinButton) {
    console.error("Required DOM elements missing");
    return;
  }

  // -------------------------------
  // SESSION HANDLING
  // -------------------------------
  function isLoggedInToday() {
    const loggedIn = localStorage.getItem("sfa_logged_in");
    const loginDate = localStorage.getItem("sfa_login_date");
    return (
      loggedIn === "true" &&
      loginDate === new Date().toDateString()
    );
  }

  function setLoggedIn() {
    localStorage.setItem("sfa_logged_in", "true");
    localStorage.setItem("sfa_login_date", new Date().toDateString());
  }

  function logout() {
    localStorage.removeItem("sfa_logged_in");
    localStorage.removeItem("sfa_login_date");
    location.reload();
  }

  // -------------------------------
  // LOGIN
  // -------------------------------
  loginButton.addEventListener("click", () => {
    const entered = staffPinInput.value.trim();

    if (entered === STAFF_PIN) {
      setLoggedIn();
      loginStatus.textContent = "Logged in";
      showApp();
      loadEvents();
    } else {
      loginStatus.textContent = "Incorrect PIN";
    }
  });

  function showApp() {
    loginSection.style.display = "none";
    eventSection.style.display = "block";
  }

  // -------------------------------
  // EVENT LOADING
  // -------------------------------
  async function loadEvents() {
    eventSelect.innerHTML = `<option value="">Loading events…</option>`;

    try {
      const response = await fetch(`${API_URL}/events`);
      if (!response.ok) throw new Error();

      const events = await response.json();
      localStorage.setItem("events_cache", JSON.stringify(events));
      populateEvents(events, false);

    } catch {
      const cached = localStorage.getItem("events_cache");
      if (cached) {
        populateEvents(JSON.parse(cached), true);
      } else {
        eventSelect.innerHTML = `<option value="">No events available</option>`;
      }
    }
  }

  function populateEvents(events, offline) {
    eventSelect.innerHTML =
      `<option value="">Select an event${offline ? " (offline)" : ""}</option>`;

    events.forEach(event => {
      const opt = document.createElement("option");
      opt.value = event.id;
      opt.textContent = `${event.name} (${event.location})`;
      eventSelect.appendChild(opt);
    });

    if (eventSelect.options.length > 1) {
      eventSelect.selectedIndex = 1;
      updateCount();
    }
  }

  // -------------------------------
  // CHECK-IN LOGIC
  // -------------------------------
  checkinButton.addEventListener("click", async () => {
    const eventId = eventSelect.value;
    const name = attendeeInput.value.trim();

    if (!eventId || !name) {
      statusDiv.textContent = "Select event and enter a name";
      return;
    }

    const key = `checkins_${eventId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");

    if (existing.includes(name.toLowerCase())) {
      statusDiv.textContent = "Already checked in";
      return;
     
    }

    existing.push(name.toLowerCase());
    localStorage.setItem(key, JSON.stringify(existing));

    statusDiv.textContent = navigator.onLine
      ? "Checked in"
      : "Checked in (offline)";

    attendeeInput.value = "";
    updateCount();
    
    // Attempt backend sync (optional)
if (navigator.onLine) {
  try {
    await fetch(`${API_URL}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: Number(eventId),
        user_name: name,
        check_in_time: new Date().toISOString(),
        synced: true
      })
    });
  } catch (err) {
    console.warn("Backend sync failed (offline or server issue)");
  }
}
});
  // -------------------------------
  // COUNT DISPLAY
  // -------------------------------
  function updateCount() {
    const eventId = eventSelect.value;
    if (!eventId) {
      countDiv.textContent = "";
      return;
    }

    const list = JSON.parse(
      localStorage.getItem(`checkins_${eventId}`) || "[]"
    );

    countDiv.textContent = `Checked in: ${list.length}`;
  }

  eventSelect.addEventListener("change", updateCount);

  // -------------------------------
  // INIT
  // -------------------------------
  if (isLoggedInToday()) {
    showApp();
    loadEvents();
  }
});