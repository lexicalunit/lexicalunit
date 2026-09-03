(function () {
  "use strict";

  var toggle = document.querySelector(".dryguy");
  if (!toggle) return;

  var sprite = toggle.querySelector("img");
  var caption = document.querySelector(".caption-text");
  var photos = Array.prototype.slice.call(
    document.querySelectorAll(".frame img"),
  );

  var showingAlt = false;

  function render() {
    photos.forEach(function (photo) {
      var isActive = (photo.dataset.role === "alt") === showingAlt;
      photo.classList.toggle("is-active", isActive);
      // Keep the hidden photo out of the accessibility tree.
      photo.setAttribute("aria-hidden", isActive ? "false" : "true");
    });

    var active = photos.find(function (photo) {
      return (photo.dataset.role === "alt") === showingAlt;
    });

    if (active && caption) {
      caption.innerHTML = "<b>" + active.dataset.title + "</b>";
    }

    sprite.src = showingAlt ? "www/img/dryguy-stare.png" : "www/img/dryguy.gif";
    toggle.setAttribute("aria-pressed", showingAlt ? "true" : "false");
  }

  toggle.addEventListener("click", function () {
    showingAlt = !showingAlt;
    render();
  });

  render();
})();
