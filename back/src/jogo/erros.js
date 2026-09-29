// Erro de regra do jogo (saldo insuficiente, não é sua vez...). As rotas devolvem 400 com a mensagem.
class ErroJogo extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroJogo';
  }
}

module.exports = { ErroJogo };
