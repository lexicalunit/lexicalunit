var show_top = false
function toggle() {
  show_top = !show_top
  if(show_top) {
    $('.top').addClass('invis')
    $('.bottom').removeClass('invis')
    $('.dryguy').attr('src', 'www/img/dryguy-stare.png')
    $('.content').addClass('colorful')
  } else {
    $('.top').removeClass('invis')
    $('.bottom').addClass('invis')
    $('.dryguy').attr('src', 'www/img/dryguy.gif')
    $('.content').removeClass('colorful')
  }
}

function hover(element) {
  element.classList.add('hovered')
}

function unhover(element) {
  element.classList.remove('hovered')
}
