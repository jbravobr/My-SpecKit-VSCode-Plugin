import { Story } from '../../story/Story';

function lower(value: string | undefined): string {
  return (value ?? '').toLowerCase();
}

function contains(haystack: string | undefined, needle: string): boolean {
  return lower(haystack).includes(needle);
}

export function isSpringBoot(story: Story): boolean {
  return story.technicalSpec.framework === 'springboot';
}

export function hasAws(story: Story): boolean {
  const infra = lower(story.technicalSpec.infrastructure);
  return /\baws\b|amazon|s3|dynamodb|sqs|sns|lambda|aurora|rds/.test(infra);
}

export function hasMongo(story: Story): boolean {
  return contains(story.technicalSpec.database, 'mongo');
}

export function hasRabbitmq(story: Story): boolean {
  const infra = lower(story.technicalSpec.infrastructure);
  return infra.includes('rabbit') || infra.includes('amqp');
}

export function hasKafka(story: Story): boolean {
  return contains(story.technicalSpec.infrastructure, 'kafka');
}

export function hasAnyDatabase(story: Story): boolean {
  const db = (story.technicalSpec.database ?? '').trim();
  if (db === '') {
    return false;
  }
  const normalized = lower(db);
  return !(
    normalized === 'na' ||
    normalized === 'n/a' ||
    normalized === '-' ||
    normalized === 'none' ||
    normalized === 'nenhum' ||
    normalized === 'nenhuma'
  );
}
