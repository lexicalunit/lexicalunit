var show_top = false;
function toggle() {
    show_top = !show_top;
    if(show_top) {
        $('.top').addClass('invis');
        $('.bottom').removeClass('invis');
        $('.dryguy').attr('src', 'www/img/dryguy-stare.png');
        $('body').addClass('colorful');
    } else {
        $('.top').removeClass('invis');
        $('.bottom').addClass('invis');
        $('.dryguy').attr('src', 'www/img/dryguy.gif');
        $('body').removeClass('colorful');
    }
}

String.prototype.splice = function(idx, rem, s) {
    return (this.slice(0, idx) + s + this.slice(idx + Math.abs(rem)));
};

function hover(element) {
    var img = element.getElementsByTagName('img')[0];
    img.src = img.src.splice(img.src.lastIndexOf('/') + 1, 0, 'v');
}

function unhover(element) {
    var img = element.getElementsByTagName('img')[0];
    var pos = img.src.lastIndexOf('/');
    img.src = img.src.slice(0, pos + 1) + img.src.slice(pos + 2);
}
