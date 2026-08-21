# Lorcana DE API

Eine einfache REST-API für die deutsche `allCards.json` mit Node.js und Express.

## Voraussetzungen

- Node.js 18 oder neuer

## Starten

```bash
npm install
npm start
```

Danach:

- API: `http://localhost:3000`
- Swagger-Doku: `http://localhost:3000/api/docs`

## Beispiele

```text
GET /api/cards
GET /api/cards/1
GET /api/cards/search?q=arielle
GET /api/cards?color=Bernstein
GET /api/cards?set=1&rarity=Episch
GET /api/cards?cost=4&inkwell=true
GET /api/cards?subtype=Prinzessin
GET /api/cards?keyword=Singen
GET /api/cards?core=true
GET /api/cards?page=2&limit=25&sort=name&order=asc
GET /api/sets
GET /api/sets/1
GET /api/sets/1/cards
```

## Filter bei `/api/cards`

`q`, `name`, `set`, `color`, `rarity`, `type`, `story`, `subtype`, `artist`, `keyword`, `cost`, `lore`, `strength`, `willpower`, `inkwell`, `core`, `infinity`, `page`, `limit`, `sort`, `order`.

`limit` ist auf maximal 250 Karten pro Antwort begrenzt.

## Online-Hosting

Das Projekt ist für Plattformen wie Render oder Railway vorbereitet. Der Server verwendet automatisch `process.env.PORT`, falls die Hosting-Plattform einen Port vorgibt.

Start Command:

```text
npm start
```

Build Command:

```text
npm install
```
