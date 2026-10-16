(() => {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("PASTE_") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("PASTE_");

  const loginPanel = document.getElementById("loginPanel");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("loginForm");
  const loginMessage = document.getElementById("loginMessage");
  const adminMessage = document.getElementById("adminMessage");
  const form = document.getElementById("pictureForm");
  const pictureId = document.getElementById("pictureId");
  const pictureName = document.getElementById("pictureName");
  const pictureCategory = document.getElementById("pictureCategory");
  const pictureFile = document.getElementById("pictureFile");
  const saveButton = document.getElementById("savePicture");
  const list = document.getElementById("pictureList");

  let client;
  let user;
  let items = [];

  const say = (el, text) => { el.textContent = text; };
  const showDashboard = loggedIn => {
    loginPanel.hidden = loggedIn;
    dashboard.hidden = !loggedIn;
  };

  function resetForm() {
    form.reset();
    pictureId.value = "";
    saveButton.textContent = "Save Picture";
  }

  async function refresh() {
    const { data, error } = await client.from("gallery_items")
      .select("id,title,category,image_path,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    items = data || [];
    renderItems();
  }

  function renderItems() {
    list.replaceChildren();

    if (!items.length) {
      const p = document.createElement("p");
      p.className = "message";
      p.textContent = "No pictures published yet.";
      list.appendChild(p);
      return;
    }

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "admin-row";

      const img = document.createElement("img");
      img.alt = "";
      img.src = client.storage.from(cfg.STORAGE_BUCKET).getPublicUrl(item.image_path).data.publicUrl;

      const details = document.createElement("div");
      details.className = "details";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const cat = document.createElement("div");
      cat.className = "muted";
      cat.textContent = item.category;
      details.append(title, cat);

      const actions = document.createElement("div");
      actions.className = "actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        pictureId.value = item.id;
        pictureName.value = item.title;
        pictureCategory.value = item.category;
        pictureFile.value = "";
        saveButton.textContent = "Update Picture";
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm(`Delete "${item.title}"?`)) return;
        const { error } = await client.from("gallery_items").delete().eq("id", item.id);
        if (error) {
          say(adminMessage, "Delete failed. Check database permissions.");
          return;
        }
        const removed = await client.storage.from(cfg.STORAGE_BUCKET).remove([item.image_path]);
        say(adminMessage, removed.error ? "Entry deleted; image cleanup may be needed." : "Picture deleted.");
        await refresh();
      });

      actions.append(edit, del);
      row.append(img, details, actions);
      list.appendChild(row);
    });
  }

  async function uploadImage(file) {
    if (!file) return null;
    const types = ["image/jpeg", "image/png", "image/webp"];
    if (!types.includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");

    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from(cfg.STORAGE_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    return path;
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!client) {
      say(loginMessage, "Complete backend setup first.");
      return;
    }

    say(loginMessage, "Signing in...");
    const { data, error } = await client.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value
    });

    if (error) {
      say(loginMessage, "Login failed. Check your email and password.");
      return;
    }

    user = data.user;
    showDashboard(true);
    say(loginMessage, "");
    try {
      await refresh();
    } catch {
      say(adminMessage, "Could not load pictures. Check database permissions.");
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!user) {
      say(adminMessage, "Please log in again.");
      return;
    }

    saveButton.disabled = true;
    say(adminMessage, "Saving...");

    try {
      const existing = items.find(item => String(item.id) === pictureId.value);
      let path = existing ? existing.image_path : null;

      if (pictureFile.files[0]) path = await uploadImage(pictureFile.files[0]);
      if (!path) throw new Error("Choose a picture file.");

      const payload = {
        title: pictureName.value.trim(),
        category: pictureCategory.value.trim(),
        image_path: path
      };
      if (!payload.title || !payload.category) throw new Error("Enter a name and category.");

      const result = existing
        ? await client.from("gallery_items").update(payload).eq("id", existing.id)
        : await client.from("gallery_items").insert(payload);

      if (result.error) throw result.error;

      if (existing && path !== existing.image_path) {
        await client.storage.from(cfg.STORAGE_BUCKET).remove([existing.image_path]);
      }

      say(adminMessage, existing ? "Picture updated." : "Picture published.");
      resetForm();
      await refresh();
    } catch (error) {
      say(adminMessage, "Could not save: " + (error.message || "Unknown error"));
    } finally {
      saveButton.disabled = false;
    }
  });

  document.getElementById("clearForm").addEventListener("click", resetForm);

  document.getElementById("logout").addEventListener("click", async () => {
    if (client) await client.auth.signOut();
    user = null;
    showDashboard(false);
    resetForm();
  });

  async function init() {
    if (!configured || !window.supabase) {
      say(loginMessage, "Setup required: configure js/config.js and your backend.");
      return;
    }

    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const { data } = await client.auth.getSession();
    if (data.session) {
      user = data.session.user;
      showDashboard(true);
      try {
        await refresh();
      } catch {
        say(adminMessage, "Could not load pictures. Check database permissions.");
      }
    }
  }

  init();
})();
