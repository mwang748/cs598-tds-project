import { writeFileSync } from 'node:fs';
import boston from '../public/study.default.json';
import { studySchema } from '../src/content/schema';
import { participantTag, studyFields, versionTag } from '../src/qualtrics/studyFields';

const study = studySchema.parse(boston);
const singleLine = (text: string) => text.replace(/\s+/g, ' ').replaceAll('[[', '[ [');
const textQuestion = (tag: string, label: string) => ['[[Question:TE]]', `[[ID:${tag}]]`, singleLine(label), ''];
const lines = [
  '[[AdvancedFormat]]',
  '[[Block:Waypoint study responses]]',
  ...textQuestion(participantTag, 'Anonymous participant ID'),
  ...textQuestion(versionTag, 'Study content version'),
  ...studyFields(study).flatMap(({ scenario, checkpoint, choiceTag, followUpTag }) => {
    const label = `${scenario.title} · ${checkpoint.title}`;
    return [
      '[[Question:MC:SingleAnswer:Vertical]]',
      `[[ID:${choiceTag}]]`,
      singleLine(`${label} · ${checkpoint.question}`),
      '[[AdvancedChoices]]',
      ...checkpoint.options.flatMap((option, index) => [`[[Choice:${index + 1}]]`, singleLine(option.id)]),
      '',
      ...(checkpoint.followUp ? textQuestion(followUpTag, `${label} · ${checkpoint.followUp}`) : []),
    ];
  }),
];

const output = process.argv[2] ?? 'qualtrics-survey.txt';
writeFileSync(output, lines.join('\n'), { flag: 'wx' });
console.log(`Wrote ${output}`);
