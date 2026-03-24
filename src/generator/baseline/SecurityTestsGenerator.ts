export function generateSecurityTests(): string {
  return `---
applyTo: "**"
---
# Testes de Segurança — Cenários Obrigatórios

## Auth Boundary — toda rota protegida

- [ ] Requisição sem token: deve retornar \`401 Unauthorized\`
- [ ] Requisição com token expirado: deve retornar \`401 Unauthorized\`
- [ ] Requisição com token válido mas papel insuficiente: deve retornar \`403 Forbidden\`
- [ ] Requisição com token de outro tenant tentando acessar recurso alheio: deve retornar \`403 Forbidden\`
- Nunca retorne \`404\` para esconder a existência de um recurso protegido — use \`403\`

## Input Inválido — nunca retorna 500

- [ ] Input com SQL injection (ex.: \`' OR '1'='1\`): deve retornar \`400\`, nunca \`500\`
- [ ] Input com XSS payload (ex.: \`<script>alert(1)</script>\`): sanitizado ou rejeitado com \`400\`
- [ ] Input com tamanho acima do máximo permitido: deve retornar \`400\` com campo identificado
- [ ] Input com tipo errado (número onde string é esperada): deve retornar \`400\`
- **Um \`500\` retornado ao cliente em qualquer cenário de input inválido é falha de segurança bloqueante**

## Dados Sensíveis em Respostas de Erro

- [ ] Mensagem de erro não vaza stack trace ao cliente
- [ ] Mensagem de erro não expõe nome de tabela, coluna ou query SQL
- [ ] Mensagem de erro não expõe tokens, chaves ou identificadores internos
- [ ] Header \`Server\` / \`X-Powered-By\` não expõe versão de framework
- [ ] Erros de autenticação retornam mensagem genérica — nunca "usuário não existe" ou "senha incorreta" separadamente

## Mass Assignment / Over-Posting

- [ ] Campos não presentes no DTO de input são ignorados — nunca vinculados à entidade
- [ ] Campos de auditoria (\`createdAt\`, \`updatedAt\`, \`id\`) não podem ser sobrescritos via input do cliente

## Rate Limiting e Brute Force

- [ ] Endpoints de autenticação possuem rate limit configurado
- [ ] Após N falhas consecutivas de autenticação, o IP é penalizado ou a conta bloqueada temporariamente
`;
}
