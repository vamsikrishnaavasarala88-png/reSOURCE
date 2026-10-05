#!/usr/bin/env node
/**
 * A stand-in AI provider, used by the browser tests only.
 *
 * The backend talks to one OpenAI-compatible endpoint, and this is that
 * endpoint: a tiny HTTP server that answers /v1/chat/completions with canned
 * JSON. Pointing AI_BASE_URL at it lets the whole Phase 6 layer - provider
 * client, prompts, validation, endpoints and the UI - run end to end without an
 * API key, and without anything pretending to be a real model in production.
 *
 * Usage:
 *   node tests/mock-ai-provider.mjs [port]        # default 8787
 *
 * It answers the four operations by looking at the prompt it receives:
 *   - a message with an image  -> material recognition
 *   - "turn a marketplace search into JSON filters" -> search intent
 *   - "owner's own description" -> listing extraction
 *   - "marketplace description" -> description generation
 *
 * Requests whose text contains FAIL answer 500, so failure handling can be
 * exercised on purpose.
 */

import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8787);
const calls = { search: 0, recognition: 0, extraction: 0, description: 0, failures: 0 };

/** System prompts start with these phrases; see the services in ai/. */
function operationFor(system, user) {
  if (Array.isArray(user)) {
    return 'recognition';
  }

  if (system.includes('marketplace search into JSON filters')) {
    return 'search';
  }

  if (system.includes("owner's own description of surplus material")) {
    return 'extraction';
  }

  if (system.includes('marketplace description for surplus construction material')) {
    return 'description';
  }

  return 'unknown';
}

function userText(user) {
  if (typeof user === 'string') {
    return user;
  }

  const part = user.find((entry) => entry.type === 'text');

  return part?.text ?? '';
}

function imageBytes(user) {
  const part = user.find((entry) => entry.type === 'image_url');
  const url = part?.image_url?.url ?? '';

  return Math.round(((url.split(',')[1] ?? '').length * 3) / 4);
}

/**
 * Turns a sentence into the filters a model would return.
 *
 * Deliberately simple and deterministic - it reads the words, it does not guess
 * - but broad enough that the demo answers ordinary searches sensibly. A number
 * the visitor stated is kept as a minimum quantity ("500 pieces"), never as a
 * promise that much exists; the backend decides what is actually on the market.
 */
const ACTIVITY_WORDS = [
  [/blood/, 'BLOOD_DONATION'],
  [/wedding|marriage|reception|function|party|festival|market|exhibition|expo|sale/, 'MARKET'],
  [/meeting|conference|class|training|seminar|workshop/, 'MEETING'],
  [/cricket|sport|game|match|tournament/, 'SPORTS'],
  [/medical|health|camp|checkup/, 'MEDICAL_CAMP'],
  [/cultural|dance|music|drama|concert/, 'CULTURAL_EVENT'],
  [/student|college|school fest|youth/, 'STUDENT_FEST'],
  [/union|committee|panchayat/, 'UNION_MEETING'],
];

const PRICE_WORDS = /(?:under|below|less than|max|maximum|budget of|up to|within)\s*(?:₹|rs\.?)?\s*(\d{2,7})/;

const FACILITY_WORDS = [
  [/parking/, 'PARKING'],
  [/electric|power/, 'ELECTRICITY'],
  [/water/, 'WATER'],
  [/washroom|toilet|restroom/, 'WASHROOMS'],
  [/light/, 'LIGHTING'],
  [/stage|podium/, 'STAGE'],
  [/seating|chairs|benches/, 'SEATING'],
  [/road access|vehicle|truck|lorry|access for/, 'ROAD_ACCESS'],
  [/public transport|bus|transport/, 'PUBLIC_TRANSPORT'],
];

const CATEGORY_WORDS = [
  [/brick/, 'BRICKS'],
  [/cement/, 'CEMENT'],
  [/tile/, 'TILES'],
  [/wood|timber|board|plank|pallet/, 'WOOD'],
  [/metal|steel|iron|pipe|rod/, 'METAL'],
  [/pipe/, 'PIPES'],
  [/sand/, 'SAND'],
  [/stone|gravel|rubble/, 'STONE'],
];

function numberBefore(lower, units) {
  const match = new RegExp('(\\d{1,7})\\s*(?:' + units + ')').exec(lower);

  return match ? Number(match[1]) : null;
}

/**
 * The same sentence with the parts that are not money removed.
 *
 * <p>"up to 4000 sq ft" and "within 10 km" use the same words a budget does, and
 * a price of 4000 for a size would be exactly the kind of guess this whole layer
 * is built to avoid. The sizes and distances are cut out before any price is
 * read.</p>
 */
function withoutSizesAndDistances(lower) {
  return lower
    .replace(/\d{1,7}\s*(?:sq\s?ft|square feet|sq\.?\s?feet|acres?)/g, ' ')
    .replace(/\d{1,7}\s*(?:km|kilometers|kilometres|miles?)/g, ' ');
}

function numberBeforePeople(lower) {
  const match = /(\d{1,5})\s*(?:people|persons|guests|members|students|attendees)/.exec(lower);

  return match ? Number(match[1]) : null;
}

function searchIntent(text) {
  const lower = text.toLowerCase();

  if (lower.includes('alien')) {
    // Deliberately invalid: the backend must sanitise it, not pass it on.
    return { resourceType: 'MATERIAL', category: 'ALIEN_METAL', maxPrice: -500 };
  }

  const material = /brick|cement|tile|wood|timber|board|plank|pallet|metal|steel|pipe|sand|stone|gravel|rubble|material/.test(lower);

  if (material) {
    const intent = { resourceType: 'MATERIAL' };
    const category = CATEGORY_WORDS.find(([pattern]) => pattern.test(lower));

    if (category) {
      intent.category = category[1];
    }

    const quantity = numberBefore(lower, 'pieces|piece|pcs|units|bags|boxes|kg|bricks|tiles|boards|pipes|bags');

    if (quantity !== null) {
      intent.minQuantity = quantity;
      intent.quantityUnit = 'pieces';
    }

    // "within 5 km of me" - a distance, like the space branch reads it. The
    // backend still does the filtering; this only proves it receives the number.
    const radius = numberBefore(lower, 'km|kilometers|kilometres');

    if (radius !== null) {
      intent.radiusKm = radius;
    }

    // "free wooden boards" is a price of zero; a stated budget is a maximum.
    if (/\bfree\b|no cost|give away|donat/.test(lower)) {
      intent.freeOnly = true;
    } else {
      const price = PRICE_WORDS.exec(withoutSizesAndDistances(lower));

      if (price) {
        intent.maxPrice = Number(price[1]);
      }
    }

    if (/new\b|unused/.test(lower)) {
      intent.condition = 'NEW';
    } else if (/damaged|broken/.test(lower)) {
      intent.condition = 'DAMAGED';
    } else if (/used|second hand|old/.test(lower)) {
      intent.condition = 'USED';
    }

    return intent;
  }

  // Anything else is read as a space search.
  const intent = { resourceType: 'SPACE' };
  const activity = ACTIVITY_WORDS.find(([pattern]) => pattern.test(lower));

  if (activity) {
    intent.activity = activity[1];
  }

  const capacity = numberBeforePeople(lower);

  if (capacity !== null) {
    intent.capacity = capacity;
  }

  // A facility the visitor asks the space to have, listed in the order asked.
  const facilities = FACILITY_WORDS.filter(([pattern]) => pattern.test(lower)).map(([, name]) => name);

  if (facilities.length > 0) {
    intent.facilities = facilities;
  }

  // "at least 2000 sq ft" / "up to 5 acres" - converted, because the backend
  // only compares square feet.
  const area = /(?:at least|minimum|min|over|more than|bigger than)\s*(\d{2,7})\s*(?:sq\s?ft|square feet|sq\.?\s?feet|acres?)/.exec(lower)
    ?? /(\d{2,7})\s*(?:sq\s?ft|square feet|sq\.?\s?feet|acres?)\s*(?:or more|minimum|at least|\+)/.exec(lower)
    ?? /(?:up to|under|below|less than|max|maximum|within)\s*(\d{2,7})\s*(?:sq\s?ft|square feet|sq\.?\s?feet|acres?)/.exec(lower);

  if (area) {
    const squareFeet = /acre/.test(area[0]) ? Number(area[1]) * 43560 : Number(area[1]);
    const upper = /up to|under|below|less than|max|maximum|within/.test(area[0]);

    if (upper) {
      intent.maxAreaSqft = squareFeet;
    } else {
      intent.minAreaSqft = squareFeet;
    }
  }

  const radius = numberBefore(lower, 'km|kilometers|kilometres');

  if (radius !== null) {
    intent.radiusKm = radius;
  }

  if (/\bfree\b|no cost|for free/.test(lower)) {
    intent.freeOnly = true;
  } else {
    const price = PRICE_WORDS.exec(withoutSizesAndDistances(lower));

    if (price) {
      intent.maxPrice = Number(price[1]);
    }
  }

  return intent;
}

function recognitionReply(bytes) {
  // A very small image stands in for "the model is not sure".
  if (bytes < 5000) {
    return { materialName: null, category: null, condition: null, confidence: 0.32 };
  }

  return {
    materialName: 'Red Clay Bricks',
    category: 'BRICKS',
    condition: 'GOOD',
    confidence: 0.93,
    description:
      'Neatly stacked red clay bricks, clean and dry, ready to be collected and reused.',
    // Sent on purpose: a quantity from a photo must never reach the UI.
    quantity: 300,
    quantityUnit: 'pieces',
  };
}

function extractionReply(text) {
  const lower = text.toLowerCase();
  const quantity = /(\d{2,6})\s*(?:red clay\s*)?bricks/.exec(lower);
  const price = /(?:₹|rs\.?\s*)(\d{3,7})/.exec(lower);

  return {
    title: 'Red Clay Bricks',
    category: 'BRICKS',
    description: 'Surplus red clay bricks from a compound wall project.',
    condition: 'GOOD',
    quantity: quantity ? Number(quantity[1]) : null,
    quantityUnit: quantity ? 'pieces' : null,
    price: lower.includes('free') ? null : price && price[1] ? Number(price[1]) : null,
    isFree: lower.includes('free') ? true : null,
    locationText: lower.includes('jaggampeta') ? 'Jaggampeta, Andhra Pradesh' : null,
  };
}

const server = createServer((request, response) => {
  if (request.method !== 'POST' || !request.url.startsWith('/v1/chat/completions')) {
    response.writeHead(404).end('{}');

    return;
  }

  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });

  request.on('end', () => {
    let payload;

    try {
      payload = JSON.parse(body);
    } catch {
      response.writeHead(400).end('{}');

      return;
    }

    const system = payload.messages?.[0]?.content ?? '';
    const user = payload.messages?.[1]?.content ?? '';
    const text = userText(user);
    const operation = operationFor(system, user);

    calls[operation] = (calls[operation] ?? 0) + 1;

    if (text.includes('FAIL') || system.includes('FAIL')) {
      calls.failures += 1;
      response.writeHead(500, { 'Content-Type': 'application/json' });

      return response.end(JSON.stringify({ error: { message: 'mock provider failure' } }));
    }

    let answer;

    switch (operation) {
      case 'recognition':
        answer = recognitionReply(imageBytes(user));
        break;
      case 'extraction':
        answer = extractionReply(text);
        break;
      case 'description':
        answer = { description: 'Surplus material offered for pickup, in the condition described above.' };
        break;
      default:
        answer = searchIntent(text);
    }

    console.log(`[mock-ai] ${operation} -> ${JSON.stringify(answer).slice(0, 120)}`);

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(answer) } }],
      }),
    );
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[mock-ai] listening on http://0.0.0.0:${port}/v1 (keys are not checked)`);
});

// A small status endpoint keeps the call counts checkable from the tests.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
