import { Story } from '../../story/Story';
import { generateCorpAwsCredentials } from './aws/CorpAwsCredentialsGenerator';
import { generateCorpAwsSecrets } from './aws/CorpAwsSecretsGenerator';
import { generateCorpNamingConventions } from './conventions/CorpNamingConventionsGenerator';
import {
  hasAnyDatabase,
  hasAws,
  hasKafka,
  hasMongo,
  hasRabbitmq,
  isSpringBoot,
} from './corpStackDetector';
import { generateCorpDataAccess } from './data/CorpDataAccessGenerator';
import { generateCorpMongo } from './data/CorpMongoGenerator';
import { generateCorpHttpIntegration } from './http/CorpHttpIntegrationGenerator';
import { generateCorpKafka } from './messaging/CorpKafkaGenerator';
import { generateCorpKafkaSpring } from './messaging/CorpKafkaSpringGenerator';
import { generateCorpRabbitmqConfig } from './messaging/CorpRabbitmqConfigGenerator';
import { generateCorpRabbitmqListener } from './messaging/CorpRabbitmqListenerGenerator';
import { generateCorpSpringConfig } from './spring/CorpSpringConfigGenerator';
import { generateCorpSpringRest } from './spring/CorpSpringRestGenerator';
import { generateCorpSpringScheduled } from './spring/CorpSpringScheduledGenerator';

export interface CorpSkill {
  name: string;
  content: string;
}

export function generateCorpSkills(story: Story): CorpSkill[] {
  const skills: CorpSkill[] = [];

  // Always-applicable (multi-stack, on-demand by Copilot keyword match)
  skills.push({ name: 'corp-naming-conventions', content: generateCorpNamingConventions() });
  skills.push({ name: 'corp-http-integration', content: generateCorpHttpIntegration() });

  // Spring-specific (3)
  if (isSpringBoot(story)) {
    skills.push({ name: 'corp-spring-scheduled', content: generateCorpSpringScheduled() });
    skills.push({ name: 'corp-spring-config', content: generateCorpSpringConfig() });
    skills.push({ name: 'corp-spring-rest', content: generateCorpSpringRest() });
  }

  // AWS (2)
  if (hasAws(story)) {
    skills.push({ name: 'corp-aws-secrets', content: generateCorpAwsSecrets() });
    skills.push({ name: 'corp-aws-credentials', content: generateCorpAwsCredentials() });
  }

  // Mongo
  if (hasMongo(story)) {
    skills.push({ name: 'corp-mongo', content: generateCorpMongo() });
  }

  // Data access universal — qualquer DB
  if (hasAnyDatabase(story)) {
    skills.push({ name: 'corp-data-access', content: generateCorpDataAccess() });
  }

  // RabbitMQ (2)
  if (hasRabbitmq(story)) {
    skills.push({ name: 'corp-rabbitmq-listener', content: generateCorpRabbitmqListener() });
    skills.push({ name: 'corp-rabbitmq-config', content: generateCorpRabbitmqConfig() });
  }

  // Kafka (multi-stack, +spring quando aplicável)
  if (hasKafka(story)) {
    skills.push({ name: 'corp-kafka', content: generateCorpKafka() });
    if (isSpringBoot(story)) {
      skills.push({ name: 'corp-kafka-spring', content: generateCorpKafkaSpring() });
    }
  }

  return skills;
}
