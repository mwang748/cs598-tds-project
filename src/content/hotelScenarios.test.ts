import { describe, expect, it } from 'vitest';
import content from '../../public/study.default.json';
import { studySchema } from './schema';

const study = studySchema.parse(content);
const dates = ['Thursday–Sunday', 'Friday–Monday', 'Saturday–Tuesday'];
const inventory = [
  { key: 'beacon', hotel: 'Beacon Court', prices: [null, 600, null] },
  { key: 'common', hotel: 'Common Street', prices: [540, 570, 510] },
  { key: 'garden', hotel: 'Garden Square', prices: [550, null, 580] },
  { key: 'harbor', hotel: 'Harbor Point', prices: [null, 550, 520] },
  { key: 'parkside', hotel: 'Parkside Grand', prices: [900, 990, 930] },
];
type Package = { id: string; hotel: string; room: string; rate: string; dates: string; total: number; walk: number; terms: string };

describe('combined accommodation scenarios', () => {
  it.each(study.scenarios.map((scenario, index) => ({ scenario, index })))('filters one inventory correctly for $scenario.id', ({ scenario, index }) => {
    const task = scenario.checkpoints.find(checkpoint => checkpoint.id === 'hotel-selection')!;
    const metadata = task.researcherMetadata!;
    const packages = metadata.eligiblePackages as Package[];
    const budget = scenario.factors?.budget === 'tight' ? 600 : 1050;
    const allowed = scenario.factors?.schedule === 'tight' ? [1] : [0, 1, 2];
    const expected = inventory.flatMap(hotel => allowed.filter(di => hotel.prices[di] !== null && hotel.prices[di]! <= budget).map(di => ({
      id: `${hotel.key}-${di}`, hotel: hotel.hotel, dates: dates[di], total: hotel.prices[di],
    })));
    expect(packages.map(({ id, hotel, dates, total }) => ({ id, hotel, dates, total }))).toEqual(expected);
    expect(packages).toHaveLength([3, 8, 4, 11][index]);
    expect(new Set(packages.map(item => item.hotel)).size).toBe([3, 4, 4, 5][index]);
    const search = task.options.find(option => option.id === 'B')!.text;
    expect(search.match(/\$\d+/g)).toHaveLength(packages.length);
    packages.forEach(item => {
      expect(search).toContain(`${item.dates}: $${item.total}`);
      expect(search).toContain(`${item.hotel} · ${item.room} · ${item.rate}`);
    });
    const shortlistIds = metadata.recommendedPackageIds as string[];
    const recommendation = task.options.find(option => option.id === 'C')!.text;
    expect(shortlistIds).toHaveLength([2, 2, 2, 3][index]);
    shortlistIds.forEach(id => {
      const item = packages.find(item => item.id === id);
      expect(item).toBeDefined();
      expect(recommendation).toContain(`${item!.hotel} · ${item!.room} · ${item!.rate} — ${item!.dates}: $${item!.total}`);
    });
    expect(recommendation).toContain('You make the final choice.');
    expect(recommendation).not.toMatch(/approve|I selected/);
    const selected = packages.find(item => item.id === metadata.selectedPackageId)!;
    expect(shortlistIds).toContain(selected.id);
    const automatic = task.options.find(option => option.id === 'D')!.text;
    expect(automatic).toContain(`${selected.dates}: $${selected.total}`);
    expect(automatic).toContain('without asking for approval');
    expect(automatic).toContain('No reservation or payment is made.');
    expect(scenario.checkpoints.some(checkpoint => checkpoint.id === 'room-and-rate')).toBe(false);
  });

  it('keeps room, rate, walking distance and cancellation terms constant across dates and budgets', () => {
    const properties = new Map<string, string>();
    study.scenarios.forEach(scenario => {
      const task = scenario.checkpoints.find(checkpoint => checkpoint.id === 'hotel-selection')!;
      (task.researcherMetadata!.eligiblePackages as Package[]).forEach(item => {
        const attributes = JSON.stringify([item.room, item.rate, item.walk, item.terms]);
        if (properties.has(item.hotel)) expect(attributes).toBe(properties.get(item.hotel));
        properties.set(item.hotel, attributes);
      });
      const context = JSON.stringify(task.context);
      expect(context).toContain('independent of your flight answers');
      if (scenario.factors?.schedule === 'flexible') {
        expect(context).toContain('including transportation');
        expect(context).toContain('at no extra cost');
      }
    });
    expect(properties.size).toBe(5);
  });
});
