import { checkRequired, checkRequiredArray } from '../validator/ValidationUtils';
import { DorStatus, Gap, Story, ValidationResult } from './Story';

export function validateStory(story: Story): ValidationResult {
  const gaps: Gap[] = [];

  checkRequired(
    gaps,
    story.metadata.title,
    'Metadata',
    'title',
    'Título da história é obrigatório',
  );

  checkRequired(
    gaps,
    story.businessRequirement.problem,
    'Requisito de Negócio',
    'problem',
    'Descrição do problema é obrigatória',
  );
  checkRequired(
    gaps,
    story.businessRequirement.value,
    'Requisito de Negócio',
    'value',
    'Valor de negócio é obrigatório',
  );
  checkRequiredArray(
    gaps,
    story.businessRequirement.stakeholders,
    'Requisito de Negócio',
    'stakeholders',
    'Pelo menos um stakeholder deve ser listado',
  );

  checkRequiredArray(
    gaps,
    story.functionalSpec.userStories,
    'Especificação Funcional',
    'userStories',
    'Pelo menos uma user story é obrigatória',
  );
  checkRequiredArray(
    gaps,
    story.functionalSpec.acceptanceCriteria,
    'Especificação Funcional',
    'acceptanceCriteria',
    'Pelo menos um critério de aceite é obrigatório',
  );

  checkRequired(
    gaps,
    story.nonFunctionalSpec.performance,
    'Especificação Não-Funcional',
    'performance',
    'Requisito de performance é obrigatório',
  );
  checkRequired(
    gaps,
    story.nonFunctionalSpec.security,
    'Especificação Não-Funcional',
    'security',
    'Requisito de segurança é obrigatório',
  );

  checkRequired(
    gaps,
    story.technicalSpec.language,
    'Especificação Técnica',
    'language',
    'Linguagem é obrigatória (typescript | javascript | java | csharp | python)',
  );
  checkRequired(
    gaps,
    story.technicalSpec.framework,
    'Especificação Técnica',
    'framework',
    'Framework é obrigatório (dotnet | springboot | angular | react | fastapi | other)',
  );
  checkRequired(
    gaps,
    story.technicalSpec.architecture,
    'Especificação Técnica',
    'architecture',
    'Arquitetura é obrigatória (hexagonal | layered | microservices | monolith | serverless)',
  );

  checkRequiredArray(
    gaps,
    story.dod.criteria,
    'DoD',
    'criteria',
    'Pelo menos um critério de DoD é obrigatório',
  );

  const dorStatus: DorStatus[] = story.dor.criteria.map((criterion, i) => ({
    criterion,
    checked: story.dor.checked[i] ?? false,
  }));

  const uncheckedDor = dorStatus.filter((d) => !d.checked);
  if (uncheckedDor.length > 0) {
    gaps.push({
      section: 'DoR',
      field: 'checked',
      message: `${uncheckedDor.length} critério(s) do DoR não marcado(s) como concluído(s)`,
    });
  }

  return { valid: gaps.length === 0, gaps, dorStatus };
}
