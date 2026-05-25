export interface ExplicitConfirmationNotice {
  intentId: string;
  confirmCommand: string;
  confirmEffect: string;
  noConfirmationEffect: string;
  ttlMinutes: number;
}

export function formatExplicitConfirmationNotice(details: ExplicitConfirmationNotice): string {
  return (
    `### 🔐 Confirmação explícita pelo usuário\n` +
    `- **Código de confirmação desta proposta:** \`${details.intentId}\`\n` +
    `- Intent-ID: \`${details.intentId}\` (mesmo código, usado para auditoria e rastreabilidade)\n` +
    `- **Para confirmar:** copie este comando: \`${details.confirmCommand}\`\n` +
    `- **Ao confirmar:** ${details.confirmEffect}\n` +
    `- **Sem confirmar:** ${details.noConfirmationEffect}\n` +
    `- **Validade:** expira em ${details.ttlMinutes} minutos; se expirar, gere uma nova proposta.\n`
  );
}

export function formatInvalidConfirmationNotice(
  intentId: string,
  regenerateCommand: string,
  subject: string,
): string {
  return (
    `❌ Código de confirmação inválido ou expirado: \`${intentId}\`.\n\n` +
    `Esse código só vale para a proposta original de ${subject} e pode ter expirado. ` +
    `Nada foi alterado.\n\n` +
    `Para continuar, gere uma nova proposta com \`${regenerateCommand}\` e confirme usando o novo código retornado.\n`
  );
}
