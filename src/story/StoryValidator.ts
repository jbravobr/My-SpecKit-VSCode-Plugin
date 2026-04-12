import { Story, ValidationResult, Gap, DorStatus } from './Story';

export function validateStory(story: Story): ValidationResult {
  const gaps: Gap[] = [];

  if (!story.metadata.title)
    gaps.push({ section: 'Metadata', field: 'title', message: 'Título da história é obrigatório' });

  if (!story.businessRequirement.problem)
    gaps.push({
      section: 'Requisito de Negócio',
      field: 'problem',
      message: 'Descrição do problema é obrigatória',
    });
  if (!story.businessRequirement.value)
    gaps.push({
      section: 'Requisito de Negócio',
      field: 'value',
      message: 'Valor de negócio é obrigatório',
    });
  if (story.businessRequirement.stakeholders.length === 0)
    gaps.push({
      section: 'Requisito de Negócio',
      field: 'stakeholders',
      message: 'Pelo menos um stakeholder deve ser listado',
    });

  if (story.functionalSpec.userStories.length === 0)
    gaps.push({
      section: 'Especificação Funcional',
      field: 'userStories',
      message: 'Pelo menos uma user story é obrigatória',
    });
  if (story.functionalSpec.acceptanceCriteria.length === 0)
    gaps.push({
      section: 'Especificação Funcional',
      field: 'acceptanceCriteria',
      message: 'Pelo menos um critério de aceite é obrigatório',
    });

  if (!story.nonFunctionalSpec.performance)
    gaps.push({
      section: 'Especificação Não-Funcional',
      field: 'performance',
      message: 'Requisito de performance é obrigatório',
    });
  if (!story.nonFunctionalSpec.security)
    gaps.push({
      section: 'Especificação Não-Funcional',
      field: 'security',
      message: 'Requisito de segurança é obrigatório',
    });

  if (!story.technicalSpec.language)
    gaps.push({
      section: 'Especificação Técnica',
      field: 'language',
      message: 'Linguagem é obrigatória (typescript | javascript | java | csharp | python)',
    });
  if (!story.technicalSpec.framework)
    gaps.push({
      section: 'Especificação Técnica',
      field: 'framework',
      message: 'Framework é obrigatório (dotnet | springboot | angular | react | fastapi | other)',
    });
  if (!story.technicalSpec.architecture)
    gaps.push({
      section: 'Especificação Técnica',
      field: 'architecture',
      message:
        'Arquitetura é obrigatória (hexagonal | layered | microservices | monolith | serverless)',
    });

  if (story.dod.criteria.length === 0)
    gaps.push({
      section: 'DoD',
      field: 'criteria',
      message: 'Pelo menos um critério de DoD é obrigatório',
    });

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
