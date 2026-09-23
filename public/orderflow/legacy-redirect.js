const target = new URL(document.getElementById("legacy-target").href);
target.search = location.search;
target.hash = location.hash;
location.replace(target.href);
