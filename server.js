const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'allCards.json');

app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

function loadData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.cards) || !data.sets || !data.metadata) {
    throw new Error('allCards.json hat nicht die erwartete Struktur: metadata, sets, cards');
  }
  return data;
}

const data = loadData();
const cards = data.cards;
const sets = data.sets;
const cardsById = new Map(cards.map((card) => [String(card.id), card]));

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseBool(value) {
  if (value === undefined) return undefined;
  const v = normalize(value);
  if (['true', '1', 'yes', 'ja'].includes(v)) return true;
  if (['false', '0', 'no', 'nein'].includes(v)) return false;
  return null;
}

function parseInteger(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function includesText(value, search) {
  return normalize(value).includes(normalize(search));
}

function exactText(value, expected) {
  return normalize(value) === normalize(expected);
}

function filterCards(query) {
  const boolInkwell = parseBool(query.inkwell);

  return cards.filter((card) => {
    if (query.q) {
      const haystack = [
        card.name,
        card.fullName,
        card.version,
        card.simpleName,
        card.story,
        card.fullText,
        card.subtypesText,
        card.artistsText,
      ].join(' ');
      if (!includesText(haystack, query.q)) return false;
    }

    if (query.name && !includesText(card.name, query.name) && !includesText(card.fullName, query.name)) return false;
    if (query.set && !exactText(card.setCode, query.set)) return false;
    if (query.ink && !exactText(card.ink, query.ink)) return false;
    if (query.rarity && !exactText(card.rarity, query.rarity)) return false;
    if (query.type && !exactText(card.type, query.type)) return false;
    if (query.story && !includesText(card.story, query.story)) return false;
    if (query.subtype && !(card.subtypes || []).some((s) => exactText(s, query.subtype))) return false;
    if (query.artist && !(card.artists || []).some((a) => includesText(a, query.artist))) return false;
    if (query.keyword && !(card.keywordAbilities || []).some((k) => exactText(k, query.keyword))) return false;

    if (query.cost !== undefined && Number(card.cost) !== Number(query.cost)) return false;
    if (query.lore !== undefined && Number(card.lore) !== Number(query.lore)) return false;
    if (query.strength !== undefined && Number(card.strength) !== Number(query.strength)) return false;
    if (query.willpower !== undefined && Number(card.willpower) !== Number(query.willpower)) return false;
    if (boolInkwell !== undefined && boolInkwell !== null && card.inkwell !== boolInkwell) return false;

    if (query.core !== undefined) {
      const core = parseBool(query.core);
      if (core !== null && Boolean(card.allowedInFormats?.Core?.allowed) !== core) return false;
    }

    if (query.infinity !== undefined) {
      const infinity = parseBool(query.infinity);
      if (infinity !== null && Boolean(card.allowedInFormats?.Infinity?.allowed) !== infinity) return false;
    }

    return true;
  });
}

function sortCards(list, sort, order) {
  const allowed = new Set(['id', 'name', 'fullName', 'setCode', 'number', 'cost', 'lore', 'strength', 'willpower', 'rarity']);
  const key = allowed.has(sort) ? sort : 'id';
  const direction = normalize(order) === 'desc' ? -1 : 1;

  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
    return String(av ?? '').localeCompare(String(bv ?? ''), 'de', { numeric: true, sensitivity: 'base' }) * direction;
  });
}

app.get('/', (req, res) => {
  res.json({
    name: 'Lorcana DE API',
    version: '1.0.0',
    language: data.metadata.language,
    generatedOn: data.metadata.generatedOn,
    cards: cards.length,
    sets: Object.keys(sets).length,
    documentation: '/api/docs',
    endpoints: {
      cards: '/api/cards',
      cardById: '/api/cards/:id',
      search: '/api/cards/search?q=arielle',
      sets: '/api/sets',
      setByCode: '/api/sets/:code',
      cardsBySet: '/api/sets/:code/cards',
      metadata: '/api/metadata'
    }
  });
});

app.get('/api/metadata', (req, res) => {
  res.json({ ...data.metadata, cardCount: cards.length, setCount: Object.keys(sets).length });
});

app.get('/api/cards', (req, res) => {
  const page = parseInteger(req.query.page, 1, 1, 1000000);
  const limit = parseInteger(req.query.limit, 50, 1, 250);
  const filtered = sortCards(filterCards(req.query), req.query.sort, req.query.order);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  res.json({
    total,
    page,
    limit,
    pages,
    filters: req.query,
    cards: filtered.slice(start, start + limit)
  });
});

app.get('/api/cards/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query-Parameter q fehlt. Beispiel: /api/cards/search?q=arielle' });

  const page = parseInteger(req.query.page, 1, 1, 1000000);
  const limit = parseInteger(req.query.limit, 50, 1, 250);
  const found = sortCards(filterCards({ ...req.query, q }), req.query.sort, req.query.order);
  const total = found.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  res.json({ query: q, total, page, limit, pages, cards: found.slice(start, start + limit) });
});

app.get('/api/cards/:id', (req, res) => {
  const card = cardsById.get(String(req.params.id));
  if (!card) return res.status(404).json({ error: 'Karte nicht gefunden', id: req.params.id });
  res.json(card);
});

app.get('/api/sets', (req, res) => {
  const result = Object.entries(sets).map(([code, set]) => ({ code, ...set }));
  res.json({ total: result.length, sets: result });
});

app.get('/api/sets/:code/cards', (req, res) => {
  const code = String(req.params.code);
  const set = sets[code];
  if (!set) return res.status(404).json({ error: 'Set nicht gefunden', code });

  const page = parseInteger(req.query.page, 1, 1, 1000000);
  const limit = parseInteger(req.query.limit, 50, 1, 250);
  const setCards = sortCards(filterCards({ ...req.query, set: code }), req.query.sort || 'number', req.query.order);
  const total = setCards.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;

  res.json({ code, set, total, page, limit, pages, cards: setCards.slice(start, start + limit) });
});

app.get('/api/sets/:code', (req, res) => {
  const code = String(req.params.code);
  const set = sets[code];
  if (!set) return res.status(404).json({ error: 'Set nicht gefunden', code });
  const actualCardCount = cards.filter((card) => String(card.setCode) === code).length;
  res.json({ code, ...set, actualCardCount });
});

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Lorcana DE API',
    version: '1.0.0',
    description: 'REST API fÃ¼r die deutsche Lorcana-Kartendatei allCards.json.'
  },
  servers: [{ url: '/' }],
  paths: {
    '/api/cards': {
      get: {
        summary: 'Karten auflisten und filtern',
        parameters: [
          ['q','Volltextsuche'], ['name','Kartenname'], ['set','Set-Code'], ['ink','Tintenfarbe'], ['rarity','Seltenheit'], ['type','Kartentyp'],
          ['story','Story'], ['subtype','Untertyp'], ['artist','KÃ¼nstler'], ['keyword','Keyword-FÃ¤higkeit'], ['cost','Kosten'], ['lore','Legendenwert'],
          ['strength','StÃ¤rke'], ['willpower','Willenskraft'], ['inkwell','true/false'], ['core','Core legal true/false'], ['infinity','Infinity legal true/false'],
          ['page','Seite'], ['limit','1-250'], ['sort','Sortierfeld'], ['order','asc/desc']
        ].map(([name, description]) => ({ name, in: 'query', schema: { type: 'string' }, description })),
        responses: { '200': { description: 'Liste von Karten' } }
      }
    },
    '/api/cards/{id}': {
      get: {
        summary: 'Eine Karte anhand der ID laden',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Karte' }, '404': { description: 'Nicht gefunden' } }
      }
    },
    '/api/cards/search': {
      get: {
        summary: 'Karten durchsuchen',
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Suchergebnisse' } }
      }
    },
    '/api/sets': { get: { summary: 'Alle Sets', responses: { '200': { description: 'Sets' } } } },
    '/api/sets/{code}': {
      get: {
        summary: 'Set-Informationen',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Set' }, '404': { description: 'Nicht gefunden' } }
      }
    },
    '/api/sets/{code}/cards': {
      get: {
        summary: 'Alle Karten eines Sets',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Set-Karten' } }
      }
    },
    '/api/metadata': { get: { summary: 'Metadaten', responses: { '200': { description: 'Metadaten' } } } }
  }
};

app.get('/api/openapi.json', (req, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint nicht gefunden', path: req.path, documentation: '/api/docs' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lorcana DE API lÃ¤uft auf http://localhost:${PORT}`);
  console.log(`Swagger: http://localhost:${PORT}/api/docs`);
  console.log(`${cards.length} Karten und ${Object.keys(sets).length} Sets geladen.`);
});

