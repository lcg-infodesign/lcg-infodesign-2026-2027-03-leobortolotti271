
const DATASET_PATH = "assets/fiumi_dataset.csv";
const CONTINENT_ORDER = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Australia",
  "Oceania"
];

const CONTINENT_LABELS = {
  "Africa": "Africa",
  "Asia": "Asia",
  "Europe": "Europa",
  "North America": "Nord America",
  "South America": "Sud America",
  "Australia": "Australia",
  "Oceania": "Oceania"
};

const PALETTE = {
  background: "#eef5dc",
  backgroundAlt: "#e2f4e4",
  ink: "#0b3829",
  muted: "#829788",
  guide: "#9db7a1",
  red: "#ea2828",
  wine: "#930046",
  violet: "#4e0084",
  blue: "#1000bd",
  highlight: "#f5f2d8"
};

const WIDE_ROW_HEIGHT = 430;
const SINGLE_ROW_HEIGHT = 390;
const WIDE_LAYOUT_BREAKPOINT = 560;
const TOP_MARGIN = 14;
const BOTTOM_MARGIN = 30;
const GLOBAL_MAX_LENGTH = 6650;

let rivers = [];
let continents = [];
let selectedRiver = null;
let canvasElement = null;
let canvasWidth = 0;
let canvasHeight = 0;

function setup() {
  const holder = document.getElementById("canvas-holder");
  if (!holder) {
    console.error('Elemento #canvas-holder non trovato.');
    return;
  }

  canvasWidth = Math.max(300, holder.clientWidth || 900);
  canvasHeight = calculateCanvasHeight();

  // Usa la densità dello schermo (fino a 2x) per rendere nitide le etichette
  // disegnate sul canvas, soprattutto sui display Retina.
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(holder);
  canvasElement = canvas.elt;
  canvasElement.setAttribute("role", "img");
  canvasElement.setAttribute(
    "aria-label",
    "Visualizzazione radiale interattiva dei fiumi del mondo, organizzati per continente. Clicca una linea per leggere i dettagli."
  );

  noLoop();

  const clearButton = document.getElementById("clear-selection");
  if (clearButton) clearButton.addEventListener("click", clearSelection);

  // In p5.js 2 il caricamento degli asset va gestito con Promise/fetch:
  // il vecchio preload() di p5.js 1 non viene più eseguito.
  drawLoadingState();
  loadRiversDataset();


}

async function loadRiversDataset() {
  try {
    const response = await fetch(DATASET_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Richiesta CSV non riuscita (${response.status} ${response.statusText}).`);
    }

    const csvText = await response.text();
    const records = parseCSV(csvText);
    if (!records.length) throw new Error("Il CSV è vuoto o non contiene righe leggibili.");

    rivers = records.map((record) => ({
      id: Number(record.id),
      name: record.name || "Fiume senza nome",
      countries: record.countries || "—",
      length: Number(record.length),
      area: Number(record.area),
      discharge: Number(record.discharge),
      outflow: record.outflow || "—",
      continent: record.continent,
      tributaries: Number(record.tributaries),
      minTemp: Number(record.min_temp),
      maxTemp: Number(record.max_temp),
      avgTemp: Number(record.avg_temp)
    })).filter((river) =>
      river.name && river.continent &&
      Number.isFinite(river.length) && Number.isFinite(river.avgTemp)
    );

    if (!rivers.length) throw new Error("Non ho trovato righe con nome, continente, lunghezza e temperatura validi.");

    buildContinents();
    console.info(`Dataset caricato: ${rivers.length} fiumi in ${continents.length} gruppi continentali.`);
    redraw();
  } catch (error) {
    console.error("Errore durante il caricamento del dataset:", error);
    showLoadError(error);
  }
}

// Parser CSV che rispetta i campi tra virgolette e le virgole nei nomi dei paesi.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

function buildContinents() {
  const maxLength = Math.max(...rivers.map((river) => river.length), GLOBAL_MAX_LENGTH);
  rivers.forEach((river) => {
    river.maxLength = maxLength;
    river.color = temperatureColor(river.avgTemp);
  });

  continents = CONTINENT_ORDER.map((name) => ({
    name,
    label: CONTINENT_LABELS[name] || name,
    rivers: rivers
      .filter((river) => river.continent === name)
      .sort((a, b) => b.length - a.length)
  })).filter((continent) => continent.rivers.length > 0);

  layoutRivers();
}

function getLayoutMetrics() {
  const columns = canvasWidth >= WIDE_LAYOUT_BREAKPOINT ? 2 : 1;
  const rowHeight = columns === 2 ? WIDE_ROW_HEIGHT : SINGLE_ROW_HEIGHT;
  const groupCount = continents.length || CONTINENT_ORDER.length;
  const rows = Math.ceil(groupCount / columns);
  return { columns, rowHeight, rows };
}

function calculateCanvasHeight() {
  const { rowHeight, rows } = getLayoutMetrics();
  return TOP_MARGIN + rows * rowHeight + BOTTOM_MARGIN;
}

function layoutRivers() {
  if (!continents.length || !canvasWidth) return;

  const { columns, rowHeight } = getLayoutMetrics();
  continents.forEach((continent, continentIndex) => {
    const rowIndex = Math.floor(continentIndex / columns);
    const columnIndex = continentIndex % columns;
    const centerX = columns === 2
      ? canvasWidth * (columnIndex === 0 ? 0.28 : 0.72)
      : canvasWidth * 0.5;
    const sectionTop = TOP_MARGIN + rowIndex * rowHeight;
    const centerY = sectionTop + (columns === 2 ? 250 : 226);
    const maxRadius = columns === 2
      ? Math.min(140, canvasWidth * 0.19)
      : Math.min(158, canvasWidth * 0.36);
    const total = continent.rivers.length;
    const angleOffset = -Math.PI / 2 + (continentIndex % 2) * 0.095;

    continent.layout = { centerX, centerY, maxRadius, sectionTop, rowHeight, columns, columnIndex };

    continent.rivers.forEach((river, index) => {
      // Tutti i raggi condividono la stessa scala: la distanza dal nucleo
      // cresce in proporzione alla lunghezza del fiume.
      const ratio = river.length / GLOBAL_MAX_LENGTH;
      const radius = maxRadius * (0.09 + 0.91 * ratio);
      const angle = total === 1
        ? angleOffset
        : angleOffset + (index / total) * Math.PI * 2;

      river.geometry = {
        continentIndex,
        centerX,
        centerY,
        x1: centerX,
        y1: centerY,
        x2: centerX + Math.cos(angle) * radius,
        y2: centerY + Math.sin(angle) * radius,
        radius,
        maxRadius,
        angle
      };
    });
  });
}

function draw() {
  background(PALETTE.background);
  if (!continents.length) {
    drawLoadingState();
    return;
  }

  drawBackgroundTexture();
  continents.forEach((continent, index) => drawContinent(continent, index));
}

function drawBackgroundTexture() {
  push();
  noStroke();
  fill(255, 255, 255, 30);
  for (let y = 18; y < height; y += 38) {
    for (let x = 16; x < width; x += 38) {
      circle(x, y, 1.2);
    }
  }
  pop();
}

function drawContinent(continent, index) {
  const layout = continent.layout;
  if (!layout) return;
  const { centerX, centerY, maxRadius, sectionTop, rowHeight, columns, columnIndex } = layout;
  const columnWidth = canvasWidth / columns;
  const left = columns === 2 ? columnIndex * columnWidth : 0;
  const right = columns === 2 ? left + columnWidth : canvasWidth;

  push();
  // Separatore leggero per ogni gruppo, senza riquadri che frammentino la pagina.
  stroke(113, 145, 119, 66);
  strokeWeight(1);
  line(left + 12, sectionTop + 4, right - 12, sectionTop + 4);

  // Titoli dei continenti: testo vettoriale ad alta densità con font di sistema.
  noStroke();
  fill(PALETTE.ink);
  textFont("Avenir Next");
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  textSize(columns === 2 ? Math.min(23, columnWidth * 0.075) : Math.min(25, canvasWidth * 0.065));
  text(continent.label, centerX, sectionTop + 34);

  fill(112, 134, 115, 220);
  textStyle(NORMAL);
  textSize(11);
  text(`${continent.rivers.length} ${continent.rivers.length === 1 ? "fiume" : "fiumi"}`, centerX, sectionTop + 56);

  // Cerchi-guida concentrici, leggeri, per leggere l'estensione dei glifi.
  noFill();
  stroke(133, 165, 139, 54);
  strokeWeight(1);
  [0.38, 0.68, 1].forEach((factor) => circle(centerX, centerY, maxRadius * factor * 2));

  // Segni cardinali discreti: sono riferimenti grafici, non coordinate geografiche.
  stroke(119, 154, 126, 82);
  line(centerX, centerY - maxRadius - 8, centerX, centerY - maxRadius - 2);
  line(centerX + maxRadius + 2, centerY, centerX + maxRadius + 8, centerY);
  line(centerX, centerY + maxRadius + 2, centerX, centerY + maxRadius + 8);
  line(centerX - maxRadius - 8, centerY, centerX - maxRadius - 2, centerY);

  // I fiumi sono disegnati prima del nucleo, con il selezionato in evidenza.
  continent.rivers.forEach((river) => {
    if (river !== selectedRiver) drawRiverGlyph(river, false);
  });
  if (selectedRiver && selectedRiver.geometry.continentIndex === index) {
    drawRiverGlyph(selectedRiver, true);
  }

  // Nucleo centrale del continente.
  noStroke();
  fill(11, 56, 41, 18);
  circle(centerX, centerY, 39);
  fill(PALETTE.ink);
  circle(centerX, centerY, 25);
  fill(207, 235, 206, 230);
  circle(centerX, centerY, 5);

  pop();
}

function drawRiverGlyph(river, isSelected) {
  if (!river.geometry) return;
  const g = river.geometry;
  const baseWeight = map(river.length, 0, GLOBAL_MAX_LENGTH, 1.8, 3.1);
  const riverColor = river.color || temperatureColor(river.avgTemp);

  push();
  strokeCap(ROUND);
  noFill();

  if (isSelected) {
    // Doppio tratto: alone chiaro + linea colorata per rendere evidente la selezione.
    stroke(PALETTE.highlight);
    strokeWeight(9);
    line(g.x1, g.y1, g.x2, g.y2);
    stroke(PALETTE.ink);
    strokeWeight(6);
    line(g.x1, g.y1, g.x2, g.y2);
    stroke(riverColor);
    strokeWeight(3.3);
    line(g.x1, g.y1, g.x2, g.y2);
    noStroke();
    fill(PALETTE.highlight);
    circle(g.x2, g.y2, 13);
    fill(riverColor);
    circle(g.x2, g.y2, 7);
  } else {
    stroke(riverColor);
    strokeWeight(baseWeight);
    line(g.x1, g.y1, g.x2, g.y2);
    noStroke();
    fill(riverColor);
    circle(g.x2, g.y2, 6.2);
  }
  pop();
}

function temperatureColor(temperature) {
  if (temperature > 21) return PALETTE.red;
  if (temperature >= 11 && temperature <= 20) return PALETTE.wine;
  if (temperature >= 1 && temperature <= 10) return PALETTE.violet;
  if (temperature <= 0) return PALETTE.blue;
  // Il dataset caricato non contiene valori nelle fasce intermedie non specificate.
  return PALETTE.wine;
}

function mousePressed() {
  if (!continents.length) return;
  const hit = findRiverAt(mouseX, mouseY);
  if (hit) {
    selectedRiver = hit;
    updateRiverCard(hit);
    redraw();
  } else {
    clearSelection();
  }
  return false;
}

function mouseMoved() {
  if (!continents.length) return;
  cursor(findRiverAt(mouseX, mouseY) ? HAND : ARROW);
}

function findRiverAt(x, y) {
  let bestRiver = null;
  let bestDistance = Infinity;
  const hitTolerance = Math.max(8, Math.min(12, canvasWidth * 0.014));

  rivers.forEach((river) => {
    if (!river.geometry) return;
    const g = river.geometry;
    const distance = distanceToSegment(x, y, g.x1, g.y1, g.x2, g.y2);
    const endpointDistance = dist(x, y, g.x2, g.y2);
    const effectiveDistance = Math.min(distance, endpointDistance * 0.72);
    if (effectiveDistance <= hitTolerance && effectiveDistance < bestDistance) {
      bestDistance = effectiveDistance;
      bestRiver = river;
    }
  });
  return bestRiver;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return dist(px, py, x1, y1);
  const t = constrain(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  const projectionX = x1 + t * dx;
  const projectionY = y1 + t * dy;
  return dist(px, py, projectionX, projectionY);
}

function updateRiverCard(river) {
  const emptyState = document.getElementById("empty-state");
  const details = document.getElementById("river-details");
  emptyState.hidden = true;
  details.hidden = false;

  document.getElementById("river-continent").textContent = CONTINENT_LABELS[river.continent] || river.continent;
  document.getElementById("river-name").textContent = river.name;
  document.getElementById("river-temperature").textContent = `${formatNumber(river.avgTemp, 1)} °C`;
  document.getElementById("river-length").textContent = formatNumber(river.length, 0);
  document.getElementById("river-discharge").textContent = formatNumber(river.discharge, 0);
  document.getElementById("river-area").textContent = `${formatNumber(river.area, 0)} km²`;
  document.getElementById("river-countries").textContent = river.countries;
  document.querySelector(".metric-temperature").style.setProperty("--selected-color", river.color);

  // Quando una selezione apre la scheda, porta automaticamente il pannello
  // laterale fino ai dettagli, senza spostare la pagina dei glifi.
  const rail = document.querySelector(".info-rail");
  const detailCard = document.getElementById("river-card");
  if (rail && detailCard && window.matchMedia("(min-width: 781px)").matches) {
    requestAnimationFrame(() => {
      const railBounds = rail.getBoundingClientRect();
      const cardBounds = detailCard.getBoundingClientRect();
      const overflowBottom = cardBounds.bottom - railBounds.bottom;
      if (overflowBottom > 0) {
        rail.scrollBy({ top: overflowBottom + 12, behavior: "smooth" });
      }
    });
  }
}

function clearSelection() {
  selectedRiver = null;
  document.getElementById("river-details").hidden = true;
  document.getElementById("empty-state").hidden = false;
  redraw();
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(value);
}

function drawLoadingState() {
  push();
  noStroke();
  fill(PALETTE.ink);
  textAlign(CENTER, CENTER);
  textFont("Avenir Next");
  textStyle(BOLD);
  textSize(17);
  text("Caricamento dei fiumi…", width / 2, height / 2);
  pop();
}

function showLoadError(error) {
  const holder = document.getElementById("canvas-holder");
  if (!holder) return;

  holder.innerHTML = "";
  const message = document.createElement("div");
  message.className = "load-error";
  message.innerHTML =
    '<strong>Non riesco a caricare i fiumi.</strong>' +
    '<p>Avvia la pagina con Live Server (non con il doppio clic su index.html) e controlla che il file si trovi in <code>assets/rivers_world.csv</code>.</p>';
  if (error && error.message) {
    const detail = document.createElement("small");
    detail.textContent = `Dettaglio: ${error.message}`;
    message.appendChild(detail);
  }
  holder.appendChild(message);
}

function windowResized() {
  const holder = document.getElementById("canvas-holder");
  if (!holder || !canvasElement) return;
  const nextWidth = Math.max(300, holder.clientWidth);
  if (Math.abs(nextWidth - canvasWidth) < 2) return;
  canvasWidth = nextWidth;
  // Mantieni l'altezza delle sette sezioni anche se il resize avviene
  // prima che il CSV abbia finito di caricarsi.
  canvasHeight = calculateCanvasHeight();
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  resizeCanvas(canvasWidth, canvasHeight);
  layoutRivers();
  redraw();
}
