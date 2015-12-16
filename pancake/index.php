<?php
    header("Status: 301 Moved Permanently");
    header("Location: http://lexicalunit.github.io/pancake-master/?". $_SERVER['QUERY_STRING']);
    exit;
?>
