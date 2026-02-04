var show_top = false;
function toggle() {
  show_top = !show_top;
  if (show_top) {
    $(".top").addClass("invis");
    $(".bottom").removeClass("invis");
    $(".dryguy").attr("src", "www/img/dryguy-stare.png");
    $(".content").addClass("colorful");
    // Show alt subtitle, hide resume
    $(".subtitle").removeClass("invis");
    $(".resume-link").addClass("invis");
  } else {
    $(".top").removeClass("invis");
    $(".bottom").addClass("invis");
    $(".dryguy").attr("src", "www/img/dryguy.gif");
    $(".content").removeClass("colorful");
    // Hide alt subtitle, show resume
    $(".subtitle").addClass("invis");
    $(".resume-link").removeClass("invis");
  }
}

function toggleMenu() {
  const menuPanel = document.querySelector(".menu-panel");
  const hamburger = document.querySelector(".hamburger");

  menuPanel.classList.toggle("open");
  hamburger.classList.toggle("active");
}

function hover(element) {
  element.classList.add("hovered");
}

function unhover(element) {
  element.classList.remove("hovered");
}
