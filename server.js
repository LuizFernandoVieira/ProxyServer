/**
* @Author Luiz Fernando Vieira de Castro Ferreira
* @Author Daniel Almeida Luz
* @brief Arquivo do servidor proxy
*
* Arquivo responsável pela criação e
* manipulação do servidor proxy
*/

var http = require('http');
var fs   = require('fs');
var url  = require('url');

/**
* Variáveis responsáveis por guardar as
* urls salvas nos arquivos blacklist.txt,
* whitelist.txt e denyterms.txt
*/
var blacklist = [];
var whitelist = [];
var denylist = [];

/**
* Variável responsável por cachear os
* chunks das páginas requisitadas
* anteriormente
*/
var responsesHash = {};

/*
* Assiste por mudanças no arquivo blacklist
* e chamada a função responsável por atualizar
* as listas salvas em memórias
*/
fs.watchFile('./blacklist', function(c,p) {
  updateBlacklist();
});

/*
* Assiste por mudanças no arquivo whitelist
* e chamada a função responsável por atualizar
* as listas salvas em memórias
*/
fs.watchFile('./whitelist', function(c,p) {
  updateWhitelist();
});

/*
* Assiste por mudanças no arquivo denyterms
* e chamada a função responsável por atualizar
* as listas salvas em memórias
*/
fs.watchFile('./denyterms', function(c,p) {
  updateDenylist();
});

/*
* Atualiza lista salva em memória
* que guarda os valores presentes
* na blacklist
*/
function updateBlacklist() {
  console.log("Atualizando Blacklist.");
  blacklist = updateList('./blacklist');
}

/*
* Atualiza lista salva em memória
* que guarda os valores presentes
* na whitelist
*/
function updateWhitelist() {
  console.log("Atualizando Whitelist.");
  whitelist = updateList('./whitelist');
}

/*
* Atualiza lista salva em memória
* que guarda os valores presentes
* na denylist
*/
function updateDenylist() {
  console.log("Atualizando Denylist.");
  denylist = updateList('./denyterms');
}

/*
* Lê arquivo txt e salva os dados lidos
* na lista passada por parâmetro
*/
function updateList(listName) {
  return fs.readFileSync(listName).toString().split('\n')
           .filter(function(rx) { return rx.length })
           .map(function(rx) { return RegExp(rx) });
}

/*
* Verifica se alguma das urls no arquivo
* blacklist corresponde à url passada
* por parâmetro para esse método
* Se a url está presente no arquivo
* blacklist então uma mensagem é escrita
* no arquivo de log
*/
function blacklisted(url) {
  var result = matchList(blacklist, url);
  return result;
}

/*
* Verifica se alguma das urls no arquivo
* whitelist corresponde à url passada
* por parâmetro para esse método
* Se a url está presente no arquivo
* whitelist então uma mensagem é escrita
* no arquivo de log
*/
function whitelisted(url) {
  var result = matchList(whitelist, url);
  if(result) {
    fs.appendFileSync("log.txt", "Página liberada (whitelist): " + url + "\n");
  }
  return result;
}

/*
* Verifica se algum dos termos no arquivo
* denyterms está presente no chunk de dados
* da página cuja url é passada por parâmetro
* Independente do termo estar ou não presente
* no arquivo, será gerada uma mensagem
* no arqvui o de log
*/
function matchDenyterms(chunk, url) {
  var result = matchList(denylist, chunk);
  if(result) {
    fs.appendFileSync("log.txt", "Termo bloqueado (denyterms): " + url + "\n");
  } else {

  }
  return result;
}

/*
* Verifica se o termo passado como
* parâmetro pertence à lista passada
* como parâmetro
*/
function matchList(list, term) {
  for (i in list) {
    if (list[i].test(term)) {
      return true;
    }
  }
  return false;
}

/*
* Responde à requisição com os dados
* que estavam salvos na cache
*/
function writeCachedResponse(response, url) {
  console.log('Dado pertence ao cache');
  response.write(responsesHash[url]);
  response.end();
  response.writeHead(200, browserRequest.headers);
}

/*
* Cria uma nova requisição proxy e
* trata as respostas vindas do servidor
*/
function makeProxyRequest(response, browserRequest) {
  var options = buildProxyRequestOptions(browserRequest);
  var callback = buildProxyRequestCallback(response, browserRequest);

  http.request(options, callback)
    .on('socket', function (socket) {
      socket.setTimeout(10000);
      socket.on('timeout', function() {
          this.abort();
      });
    })
    .on('error', function(err) {
      if (err.code === "ECONNRESET") {
          fs.appendFileSync("log.txt", "Timeout: " + browserRequest.url);
          response.writeHead(408, 'text/plain');
          response.end('Timeout');
      }
    })
    .end();
}

/*
* Seta as options passadas para o
* método http.request
*/
function buildProxyRequestOptions(browserRequest) {
  return {
    port: 80,
    host: browserRequest.headers['host'],
    method: browserRequest.method,
    path: url.parse(browserRequest.url).pathname
  };
}

/*
* Seta a função callback passadas para o
* método http.request
* Essa função será chamada quando o proxy
* receber uma resposta do servidor
*/
function buildProxyRequestCallback(response, browserRequest) {
  return function(proxyResponse) {
    var blocked = false;

    proxyResponse.on('data', function(chunk) {
      if(!whitelisted(browserRequest.url) && matchDenyterms(chunk, browserRequest.url)) {
        blocked = true;
        console.log('A pagina possui termos bloqueados.');
        response.writeHead(403, 'text/plain');
        response.end('A pagina possui termos bloqueados.');
        return;
      } else if (!blocked) {
        response.write(chunk, 'binary');
        responsesHash[browserRequest.url] = chunk;
      }
    });

    proxyResponse.on('end', function() {
      response.end();
    });

    response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
  }
}

/*
* Callback chamado sempre que é detectada
* a chegada de uma requisição do browser
* Essa método é o responsável por chamar
* uma nova requisição proxy
*/
var server = http.createServer(function(browserRequest, response) {
  if(!whitelisted(browserRequest.url) && blacklisted(browserRequest.url)) {
    response.writeHead(403, 'text/plain');
    response.end('A pagina que voce tentou acessar e bloqueada.');
    fs.appendFileSync("log.txt", "Página bloqueada (blacklist): " + browserRequest.url);
    return;
  }

  makeProxyRequest(response, browserRequest);
});
server.listen(3000, 'localhost');

/*
* Faz o update de todas as listas em
* memória que guardam os valores salvos
* nos arquivos txt de blacklist,
* whitelist e denyterms
*/
updateBlacklist();
updateWhitelist();
updateDenylist();

/*
// if(responsesHash[browserRequest.url] && browserRequest.url != 'http://www.cic.unb.br/') {
//   writeCachedResponse(response, browserRequest.url);
// } else {
//   ...
// }

// fs.appendFileSync("log.txt", "Encaminhamento autorizado: " + url + "\n");
*/
