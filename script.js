// Store references to parts of the page.
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const productSearch = document.getElementById("productSearch");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");
const clearSelectionsButton = document.getElementById("clearSelections");
const rtlToggle = document.getElementById("rtlToggle");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

// This project calls the class-hosted Cloudflare Worker, never OpenAI directly.
// Replace this with the Worker URL provided by your instructor.
const workerUrl = "https://loreal-chatbot.kcliff24.workers.dev/";

// Keep the selected products and the AI conversation in memory.
let allProducts = [];
let selectedProducts = loadSelectedProducts();
let messages = [];

// Show a starting message until the user chooses a category.
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

// Load real product data from the local JSON file.
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

// Create a card for each product and include an accessible description toggle.
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">No matching products found</div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <article class="product-card ${selectedProducts.some((item) => item.id === product.id) ? "selected" : ""}"
      data-product-id="${product.id}" tabindex="0" aria-label="Select ${product.name}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button class="description-btn" type="button" data-description-id="${product.id}">
          View description
        </button>
        <p class="product-description" id="description-${product.id}" hidden>
          ${product.description}
        </p>
      </div>
    </article>
  `
    )
    .join("");
}

// Apply the selected category and optional search text together.
function filterProducts() {
  const selectedCategory = categoryFilter.value;
  const searchText = productSearch.value.trim().toLowerCase();

  let filteredProducts = allProducts;

  if (selectedCategory) {
    filteredProducts = filteredProducts.filter(
      (product) => product.category === selectedCategory
    );
  }

  if (searchText) {
    filteredProducts = filteredProducts.filter((product) =>
      `${product.name} ${product.brand} ${product.description}`
        .toLowerCase()
        .includes(searchText)
    );
  }

  displayProducts(filteredProducts);
}

// Load products once when the page starts.
async function initializeProducts() {
  allProducts = await loadProducts();
  filterProducts();
  updateSelectedProducts();
}

categoryFilter.addEventListener("change", filterProducts);
productSearch.addEventListener("input", filterProducts);

// Select or unselect a product card and keep the selected list in sync.
productsContainer.addEventListener("click", (event) => {
  const descriptionButton = event.target.closest(".description-btn");
  if (descriptionButton) {
    event.stopPropagation();
    const descriptionId = descriptionButton.dataset.descriptionId;
    const description = document.getElementById(`description-${descriptionId}`);
    const isHidden = description.hidden;
    description.hidden = !isHidden;
    descriptionButton.textContent = isHidden ? "Hide description" : "View description";
    return;
  }

  const card = event.target.closest(".product-card");
  if (card) {
    toggleProduct(Number(card.dataset.productId));
  }
});

// Let keyboard users select a product card with Enter or Space.
productsContainer.addEventListener("keydown", (event) => {
  if (event.target.classList.contains("product-card") &&
      (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    toggleProduct(Number(event.target.dataset.productId));
  }
});

function toggleProduct(productId) {
  const existingIndex = selectedProducts.findIndex((item) => item.id === productId);

  if (existingIndex >= 0) {
    selectedProducts.splice(existingIndex, 1);
  } else {
    const product = allProducts.find((item) => item.id === productId);
    if (product) selectedProducts.push(product);
  }

  saveSelectedProducts();
  updateSelectedProducts();
  filterProducts();
}

function saveSelectedProducts() {
  localStorage.setItem("lorealSelectedProducts", JSON.stringify(selectedProducts));
}

function loadSelectedProducts() {
  const savedProducts = localStorage.getItem("lorealSelectedProducts");
  if (!savedProducts) return [];

  try {
    return JSON.parse(savedProducts);
  } catch (error) {
    localStorage.removeItem("lorealSelectedProducts");
    return [];
  }
}

// Toggle text direction so the interface also works in RTL languages.
rtlToggle.addEventListener("click", () => {
  const isRtl = document.body.classList.toggle("rtl");
  rtlToggle.setAttribute("aria-pressed", String(isRtl));
  rtlToggle.textContent = isRtl ? "LTR mode" : "RTL mode";
});

// Show selected products with a remove button for each item.
function updateSelectedProducts() {
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="empty-selection">No products selected yet.</p>';
    clearSelectionsButton.hidden = true;
    return;
  }

  clearSelectionsButton.hidden = false;
  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-chip">
        <span>${product.brand} - ${product.name}</span>
        <button type="button" data-remove-id="${product.id}" aria-label="Remove ${product.name}">
          &times;
        </button>
      </div>
    `
    )
    .join("");
}

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");
  if (removeButton) {
    toggleProduct(Number(removeButton.dataset.removeId));
  }
});

clearSelectionsButton.addEventListener("click", () => {
  selectedProducts = [];
  saveSelectedProducts();
  updateSelectedProducts();
  filterProducts();
});

// Send selected product details to the Worker and display the routine.
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    addChatMessage("assistant", "Please select at least one product first.");
    return;
  }

  const productDetails = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const userMessage =
    "You are a helpful L'Oreal skincare and beauty advisor. Create a personalized beauty routine using only these selected products: " +
    JSON.stringify(productDetails) +
    " Explain the routine in clear steps.";

  await sendMessage(userMessage, "Creating my personalized routine...");
});

// Follow-up chat messages use the full conversation history.
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  await sendMessage(text);
});

async function sendMessage(text, displayText = text) {
  const userMessage = { role: "user", content: text };
  messages.push(userMessage);
  addChatMessage("user", displayText);

  const loadingMessage = addChatMessage("assistant", "Thinking...");

  try {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) throw new Error(`Worker returned ${response.status}`);

    const data = await response.json();
    const reply = data.choices[0].message.content;
    loadingMessage.remove();
    messages.push({ role: "assistant", content: reply });
    addChatMessage("assistant", reply);
  } catch (error) {
    loadingMessage.remove();
    addChatMessage(
      "assistant",
      "I couldn't connect to the advisor. Please check the Cloudflare Worker URL and try again."
    );
  }
}

// Add a chat bubble safely using textContent instead of HTML.
function addChatMessage(role, text) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}`;
  messageElement.textContent = text;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return messageElement;
}

initializeProducts();
