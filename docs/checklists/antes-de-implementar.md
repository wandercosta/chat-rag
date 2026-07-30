# Checklist antes de implementar

- [ ] Ler `docs/README.md` e os documentos do modulo alterado.
- [ ] Confirmar que a decisao nao contradiz ADRs existentes.
- [ ] Definir contrato, autorizacao, limites e auditoria antes da rota/tela.
- [ ] Proteger toda consulta por `organization_id`.
- [ ] Atualizar documentacao na mesma alteracao quando houver nova regra.
- [ ] Criar teste de isolamento e teste de contrato relevante.
- [ ] Nao registrar segredos, tokens ou conteudo sensivel em logs.
- [ ] Validar migracao, fila, rollback e saude quando alterar infraestrutura.
