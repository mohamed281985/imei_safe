import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCountryAliases,
  distanceInMeters,
  filterNearbyRewardOffers,
  resolveCountryKey,
} from './rewardOfferLocation.js';

const countries = buildCountryAliases([
  { name_en: 'Egypt', name_ar: 'مصر' },
  { name_en: 'Saudi Arabia', name_ar: 'المملكة العربية السعودية' },
]);

const baseOffer = {
  user_id: 'seller-eg',
  store_latitude: 30,
  store_longitude: 31,
};

test('matches country names in Arabic and English to the same country', () => {
  assert.equal(resolveCountryKey('مصر', countries), resolveCountryKey('Egypt', countries));
});

test('matches using the country stored on the offer even if seller profile country differs', () => {
  const result = filterNearbyRewardOffers({
    offers: [{ ...baseOffer, id: 'offer-country', countries: 'مصر', store_longitude: 31.01 }],
    sellerCountries: new Map([['seller-eg', 'Saudi Arabia']]),
    countryAliases: countries,
    userCountry: 'Egypt',
    latitude: 30,
    longitude: 31,
    radiusMeters: 10000,
  });

  assert.deepEqual(result.map((offer) => offer.id), ['offer-country']);
});

test('uses seller profile country only for legacy offers without an offer country', () => {
  const result = filterNearbyRewardOffers({
    offers: [{ ...baseOffer, id: 'legacy-offer', store_longitude: 31.01 }],
    sellerCountries: new Map([['seller-eg', 'Egypt']]),
    countryAliases: countries,
    userCountry: 'مصر',
    latitude: 30,
    longitude: 31,
    radiusMeters: 10000,
  });

  assert.deepEqual(result.map((offer) => offer.id), ['legacy-offer']);
});

test('calculates the distance between nearby points in meters', () => {
  const distance = distanceInMeters(30, 31, 30, 31.01);
  assert.ok(distance > 900 && distance < 1000);
});

test('returns only same-country offers within 10 km, sorted nearest first', () => {
  const sellers = new Map([
    ['seller-eg', 'Egypt'],
    ['seller-sa', 'Saudi Arabia'],
  ]);
  const offers = [
    { ...baseOffer, id: 'near', store_longitude: 31.01 },
    { ...baseOffer, id: 'far', store_longitude: 31.2 },
    { ...baseOffer, id: 'other-country', user_id: 'seller-sa', store_longitude: 31.001 },
    { ...baseOffer, id: 'missing-location', store_latitude: null },
  ];

  const result = filterNearbyRewardOffers({
    offers,
    sellerCountries: sellers,
    countryAliases: countries,
    userCountry: 'مصر',
    latitude: 30,
    longitude: 31,
    radiusMeters: 10000,
  });

  assert.deepEqual(result.map((offer) => offer.id), ['near']);
});

test('returns the closest same-country offer when no offers are within 10 km', () => {
  const result = filterNearbyRewardOffers({
    offers: [
      { ...baseOffer, id: 'farther', store_longitude: 31.3 },
      { ...baseOffer, id: 'nearest', store_longitude: 31.2 },
      { ...baseOffer, id: 'other-country-nearest', user_id: 'seller-sa', store_longitude: 31.001 },
    ],
    sellerCountries: new Map([['seller-eg', 'Egypt'], ['seller-sa', 'Saudi Arabia']]),
    countryAliases: countries,
    userCountry: 'Egypt',
    latitude: 30,
    longitude: 31,
    radiusMeters: 10000,
  });

  assert.deepEqual(result.map((offer) => offer.id), ['nearest']);
  assert.equal(result[0].nearest_fallback, true);
  assert.ok(result[0].distance_meters > 10000);
});

test('prefers offers within 10 km instead of a closer-ranked fallback result outside the radius', () => {
  const result = filterNearbyRewardOffers({
    offers: [
      { ...baseOffer, id: 'in-range', store_longitude: 31.05 },
      { ...baseOffer, id: 'outside', store_longitude: 31.2 },
    ],
    sellerCountries: new Map([['seller-eg', 'Egypt']]),
    countryAliases: countries,
    userCountry: 'Egypt',
    latitude: 30,
    longitude: 31,
    radiusMeters: 10000,
  });

  assert.deepEqual(result.map((offer) => offer.id), ['in-range']);
  assert.equal(result[0].nearest_fallback, undefined);
});
