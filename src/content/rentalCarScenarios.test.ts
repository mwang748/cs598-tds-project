import { describe, expect, it } from 'vitest';
import content from '../../public/study.default.json';
import { studySchema } from './schema';

const study = studySchema.parse(content);
const rentalScenarios = study.scenarios.filter(scenario => scenario.checkpoints.some(task => task.id === 'rental-car-selection'));
const dates = ['Thursday–Sunday', 'Friday–Monday', 'Saturday–Tuesday'];
const inventory = [
  {
    "key": "beacon",
    "provider": "Beacon Rentals",
    "car": "Compact",
    "location": "Logan airport rental center",
    "transfer": 10,
    "prices": [
      null,
      270,
      null
    ]
  },
  {
    "key": "city",
    "provider": "City Rentals",
    "car": "Compact",
    "location": "Downtown Boston",
    "transfer": 25,
    "prices": [
      null,
      220,
      200
    ]
  },
  {
    "key": "garden",
    "provider": "Garden Rentals",
    "car": "Midsize",
    "location": "Near-airport location",
    "transfer": 20,
    "prices": [
      250,
      260,
      null
    ]
  },
  {
    "key": "harbor",
    "provider": "Harbor Rentals",
    "car": "Compact",
    "location": "Downtown Boston",
    "transfer": 35,
    "prices": [
      180,
      210,
      190
    ]
  },
  {
    "key": "metro",
    "provider": "Metro Rentals",
    "car": "SUV",
    "location": "Logan airport rental center",
    "transfer": 10,
    "prices": [
      null,
      360,
      340
    ]
  },
  {
    "key": "park",
    "provider": "Park Rentals",
    "car": "Midsize",
    "location": "Logan airport rental center",
    "transfer": 10,
    "prices": [
      null,
      300,
      290
    ]
  },
  {
    "key": "river",
    "provider": "River Rentals",
    "car": "SUV",
    "location": "Downtown Boston",
    "transfer": 35,
    "prices": [
      null,
      280,
      270
    ]
  },
  {
    "key": "west",
    "provider": "West Rentals",
    "car": "Midsize",
    "location": "Downtown Boston",
    "transfer": 35,
    "prices": [
      225,
      235,
      null
    ]
  }
];
type Package = { id: string; provider: string; car: string; location: string; transferMinutesEachWay: number; dates: string; pickupTime: string; returnTime: string; total: number };

describe('rental-car selection scenarios', () => {
  it('mentions only rental companies actually displayed within each response', () => {
    for (const scenario of rentalScenarios) {
      const task = scenario.checkpoints.find(checkpoint => checkpoint.id === 'rental-car-selection')!;
      for (const option of task.options.filter(option => option.kind === 'chatbot')) {
        const displayedNames = new Set([...option.text.matchAll(/^- (.*?) ·/gm)].map(match => match[1]));
        for (const company of inventory) {
          if (option.text.includes(company.provider)) expect(displayedNames.has(company.provider), `${scenario.id}/${option.id} mentions ${company.provider} without displaying it`).toBe(true);
        }
      }
    }
  });
  it.each(rentalScenarios.map((scenario, index) => ({ scenario, index })))('filters prices, locations and dates correctly for $scenario.id', ({ scenario, index }) => {
    const task = scenario.checkpoints.find(checkpoint => checkpoint.id === 'rental-car-selection')!;
    const metadata = task.researcherMetadata!;
    const packages = metadata.eligiblePackages as Package[];
    const budget = scenario.factors?.budget === 'tight' ? 240 : 450;
    const allowed = scenario.factors?.schedule === 'tight' ? [1] : [0, 1, 2];
    const expected = inventory.flatMap(provider => allowed.filter(di => provider.prices[di] !== null && provider.prices[di]! <= budget).map(di => ({
      id: `${provider.key}-${di}`, provider: provider.provider, car: provider.car, location: provider.location,
      transferMinutesEachWay: provider.transfer, dates: dates[di], pickupTime: '10 a.m. ET', returnTime: '10 a.m. ET', total: provider.prices[di],
    })));
    expect(packages).toEqual(expected);
    expect(packages).toHaveLength([3, 7, 8, 16][index]);
    expect(metadata.rentalDurationHours).toBe(72);
    const search = task.options.find(option => option.id === 'B')!.text;
    expect(search.match(/\$\d+/g)).toHaveLength(packages.length);
    packages.forEach(item => {
      expect(search).toContain(`${item.dates}: $${item.total}`);
      expect(search).toContain(`${item.provider} · ${item.car}`);
      expect(search).toContain(`${item.location}; ${item.transferMinutesEachWay}-minute shuttle each way.`);
    });
    const shortlistIds = metadata.recommendedPackageIds as string[];
    const recommendation = task.options.find(option => option.id === 'C')!.text;
    expect(shortlistIds).toHaveLength([2, 3, 3, 3][index]);
    shortlistIds.forEach(id => {
      const item = packages.find(item => item.id === id)!;
      expect(item).toBeDefined();
      expect(recommendation).toContain(`${item.provider} · ${item.car} — ${item.dates}: $${item.total}`);
    });
    expect(recommendation).toContain('You make the final choice.');
    expect(recommendation).not.toMatch(/approve|I selected/);
    const selected = packages.find(item => item.id === metadata.selectedPackageId)!;
    expect(shortlistIds).toContain(selected.id);
    const automatic = task.options.find(option => option.id === 'D')!.text;
    expect(automatic).toContain(`${selected.provider} · ${selected.car} — ${selected.dates}: $${selected.total}`);
    const comparisonIds = metadata.comparisonPackageIds as string[];
    expect(comparisonIds).toContain(selected.id);
    comparisonIds.forEach(id => {
      const item = packages.find(item => item.id === id)!;
      expect(item).toBeDefined();
      expect(automatic).toContain(`${item.provider} · ${item.car} — ${item.dates}: $${item.total}`);
    });
    expect(automatic).toContain('without asking for approval');
    expect(automatic).toContain('No reservation or payment is made.');
    const context = JSON.stringify(task.context);
    expect(context).toContain('Independent of earlier flight/hotel answers');
    expect(context).toContain('72 hours');
    if (scenario.factors?.schedule === 'flexible') {
      expect(context).toContain('without extra flight or hotel costs');
      expect(context).toContain('no preference.');
    }
  });

  it('keeps cancellation and coverage fixed and makes transfer assumptions explicit', () => {
    const task = study.scenarios[0].checkpoints.find(checkpoint => checkpoint.id === 'rental-car-selection')!;
    const context = JSON.stringify(task.context);
    expect(context).toContain('Shuttles are free');
    expect(context).toContain('times include waiting');
    expect(context).toContain('coverage and rental terms are identical.');
    expect(study.settings.taskOrder).toEqual(['flight-selection', 'hotel-selection', 'rental-car-selection']);
  });
});
