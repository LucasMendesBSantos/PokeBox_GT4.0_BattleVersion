const app = require('./src/app');

const PORTA = process.env.PORT || 8080;

// No Express 5, erros como "porta ocupada" chegam aqui em vez de derrubar o processo
app.listen(PORTA, (erro) => {
  if (erro) throw erro;
  console.log(`Back do PokeBox rodando na porta ${PORTA}`);
});

// Jogadas automáticas das batalhas com prazo de 4h vencido (só com banco configurado)
if (process.env.DATABASE_URL) {
  require('./src/jogo/agendador').iniciarAgendador();
} else {
  console.warn('DATABASE_URL não configurada: só o proxy da PokeAPI vai funcionar.');
}
