// Catálogo Técnico Cortag — lógica client-side, sem build step.
// Carrega data/categories.json e data/products.json (leve — sem fotos),
// e só busca a foto em alta resolução quando o usuário abre uma ficha.

const DATA_BASE = "data/";

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("Falha ao carregar " + path);
  return res.json();
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ---------- index.html ----------
async function initHome() {
  const grid = document.getElementById("category-grid");
  const searchInput = document.getElementById("search-input");
  const resultsEl = document.getElementById("search-results");

  const [categories, products] = await Promise.all([
    loadJSON(DATA_BASE + "categories.json"),
    loadJSON(DATA_BASE + "products.json"),
  ]);

  grid.innerHTML = categories
    .map(
      (c) =>
        `<a class="category-card" href="categoria.html?cat=${c.id}">${c.nome}</a>`
    )
    .join("");

  searchInput.addEventListener("input", () => {
    const term = normalize(searchInput.value.trim());
    if (!term) {
      resultsEl.innerHTML = "";
      grid.style.display = "grid";
      return;
    }
    grid.style.display = "none";

    const matches = [];
    products.forEach((p) => {
      const haystackFamilia = normalize(p.linha + " " + p.categoriaNome);
      if (haystackFamilia.includes(term)) {
        matches.push({ produto: p, variante: null });
      }
      (p.variantes || []).forEach((v) => {
        const hay = normalize(v.modelo + " " + v.codigo + " " + v.ean);
        if (hay.includes(term)) matches.push({ produto: p, variante: v });
      });
    });

    if (!matches.length) {
      resultsEl.innerHTML = `<div class="empty-state">Nenhum produto encontrado para "${searchInput.value}".</div>`;
      return;
    }

    resultsEl.innerHTML = matches
      .slice(0, 30)
      .map(({ produto, variante }) => {
        const nome = variante ? variante.modelo : produto.linha;
        const meta = variante
          ? `Cód. ${variante.codigo} · ${produto.linha} · ${produto.categoriaNome}`
          : `${produto.categoriaNome}`;
        return `<a class="result-item" href="produto.html?id=${produto.id}${
          variante ? "&codigo=" + variante.codigo : ""
        }">
          <div class="r-nome">${nome}</div>
          <div class="r-meta">${meta}</div>
        </a>`;
      })
      .join("");
  });
}

// ---------- categoria.html ----------
async function initCategoria() {
  const catId = qs("cat");
  const [categories, products] = await Promise.all([
    loadJSON(DATA_BASE + "categories.json"),
    loadJSON(DATA_BASE + "products.json"),
  ]);

  const cat = categories.find((c) => c.id === catId);
  document.getElementById("cat-title").textContent = cat
    ? cat.nome
    : "Categoria";

  const list = products.filter((p) => p.categoria === catId);
  const container = document.getElementById("product-list");

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">Ainda não extraímos os produtos dessa categoria.<br>Volte em breve.</div>`;
    return;
  }

  container.innerHTML = list
    .map(
      (p) => `<a class="product-card" href="produto.html?id=${p.id}">
        <img loading="lazy" src="${p.imagem}" alt="${p.linha}">
        <div>
          <div class="p-nome">${p.linha}</div>
          <div class="p-tag">${p.tagline || ""}</div>
        </div>
      </a>`
    )
    .join("");
}

// ---------- produto.html ----------
async function initProduto() {
  const id = qs("id");
  const codigoAlvo = qs("codigo");
  const products = await loadJSON(DATA_BASE + "products.json");
  const p = products.find((x) => x.id === id);
  const root = document.getElementById("ficha-root");

  if (!p) {
    root.innerHTML = `<div class="empty-state">Produto não encontrado.</div>`;
    return;
  }

  document.title = p.linha + " — Catálogo Técnico Cortag";
  document.getElementById("cat-title").textContent = p.linha;

  let html = "";
  if (p.selo) html += `<div class="selo">${p.selo}</div>`;
  html += `<img class="hero-img skeleton" alt="${p.linha}" data-src="${p.imagem}">`;
  html += `<h1 class="linha-title">${p.linha}</h1>`;
  if (p.tagline) html += `<div class="tagline">${p.tagline}</div>`;
  if (p.descricao) html += `<div class="descricao">${p.descricao}</div>`;

  if (p.destaques && p.destaques.length) {
    html += `<div class="section-title">Destaques</div>`;
    html += `<ul class="destaques">${p.destaques
      .map((d) => `<li>${d}</li>`)
      .join("")}</ul>`;
  }

  if (p.rodelPadrao) {
    html += `<div class="section-title">Rodel padrão da máquina</div>`;
    html += `<div class="descricao">${p.rodelPadrao}</div>`;
  }

  if (p.comparativo) {
    html += `<div class="section-title">Comparativo entre modelos</div>`;
    html += `<div class="table-scroll"><table class="specs"><thead><tr>${p.comparativo.colunas
      .map((c) => `<th>${c}</th>`)
      .join("")}</tr></thead><tbody>`;
    html += p.comparativo.linhas
      .map((l) => {
        const cells = [
          l.modelo,
          l.rodas ? '<span class="check-yes">&#10003;</span>' : '<span class="check-no">&#10005;</span>',
          l.alca ? '<span class="check-yes">&#10003;</span>' : '<span class="check-no">&#10005;</span>',
          l.ajusteLateral ? '<span class="check-yes">&#10003;</span>' : '<span class="check-no">&#10005;</span>',
          l.apoioLateral,
        ];
        return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
      })
      .join("");
    html += `</tbody></table></div>`;
  }

  if (p.variantes && p.variantes.length) {
    // camposVariante define, na mesma ordem de "colunas", qual propriedade
    // de cada variante entra em cada coluna — cada categoria tem specs diferentes
    // (voltagem, potência, disco...), então a tabela é montada de forma genérica.
    const campos = p.camposVariante || ["modelo", "comprimento", "areaMax", "espessuraMax", "embalagem", "ean", "codigo"];
    html += `<div class="section-title">Modelos e códigos</div>`;
    html += `<div class="table-scroll"><table class="specs"><thead><tr>${p.colunas
      .map((c) => `<th>${c}</th>`)
      .join("")}</tr></thead><tbody>`;
    html += p.variantes
      .map((v) => {
        const highlight = codigoAlvo && v.codigo === codigoAlvo ? " highlight" : "";
        const cells = campos.map((campo) => `<td>${v[campo] ?? ""}</td>`).join("");
        return `<tr class="${highlight.trim()}">${cells}</tr>`;
      })
      .join("");
    html += `</tbody></table></div>`;
  }

  if (p.observacao) {
    html += `<div class="descricao">${p.observacao}</div>`;
  }

  if (p.fonte) {
    html += `<div class="fonte-nota">Fonte: ${p.fonte.arquivo}, pág. ${p.fonte.pagina}</div>`;
  }

  root.innerHTML = html;

  // Carrega a foto em alta resolução só agora (sob demanda).
  const img = root.querySelector(".hero-img");
  const realSrc = img.getAttribute("data-src");
  const loader = new Image();
  loader.onload = () => {
    img.src = realSrc;
    img.classList.remove("skeleton");
  };
  loader.src = realSrc;

  if (codigoAlvo) {
    setTimeout(() => {
      const row = root.querySelector("tr.highlight");
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }
}
