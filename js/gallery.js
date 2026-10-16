(() => {
  const cfg = window.APP_CONFIG || {};
  const ready = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("PASTE_") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("PASTE_");

  const gallery = document.getElementById("gallery");
  const search = document.getElementById("search");
  const category = document.getElementById("category");
  const message = document.getElementById("message");
  const count = document.getElementById("count");
  let client;
  let items = [];

  function render() {
    const term = search.value.trim().toLowerCase();
    const selected = category.value;
    const filtered = items.filter(item =>
      item.title.toLowerCase().includes(term) &&
      (!selected || item.category === selected)
    );

    gallery.replaceChildren();
    count.textContent = `${filtered.length} pictures`;

    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "message";
      empty.textContent = items.length
        ? "No pictures match your search."
        : "No pictures have been published yet.";
      gallery.appendChild(empty);
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement("article");
      card.className = "photo-card";
      const img = document.createElement("img");
      img.src = client.storage.from(cfg.STORAGE_BUCKET).getPublicUrl(item.image_path).data.publicUrl;
      img.alt = item.title;
      img.loading = "lazy";
      const title = document.createElement("h2");
      title.textContent = item.title;
      card.append(img, title);
      gallery.appendChild(card);
    });
  }

  async function load() {
    if (!ready || !window.supabase) {
      message.textContent = "Backend setup is incomplete. Configure js/config.js first.";
      return;
    }

    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const { data, error } = await client.from("gallery_items")
      .select("id,title,category,image_path,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      message.textContent = "Could not load the gallery. Check database setup and permissions.";
      return;
    }

    items = data || [];
    [...new Set(items.map(item => item.category))].sort().forEach(name => {
      category.add(new Option(name, name));
    });
    message.textContent = "";
    render();
  }

  search.addEventListener("input", render);
  category.addEventListener("change", render);
  load();
})();
