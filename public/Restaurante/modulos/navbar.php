<?php
  // Nombre del archivo actual
  $pagina = basename($_SERVER['PHP_SELF']);
?>

<nav class="navbar navbar-expand-lg navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="Index.html">MiSitio</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav"
      aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>

      <form class="d-flex mx-auto" role="search" method="GET" action="/productos">
        <input
          class="form-control me-2"
          type="search"
          placeholder="Buscar productos..."
          aria-label="Buscar"
          name="q"
        />
        <button class="btn btn-light" type="submit">Buscar</button>
      </form>

    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav ms-auto">
        <li class="nav-item">
          <a class="nav-link <?= ($pagina == 'index.html') ? 'active' : '' ?>" href="Index.html">Inicio</a>
        </li>
        <li class="nav-item">
          <a class="nav-link <?= ($pagina == 'comida.html') ? 'active' : '' ?>" href="modulos/comida.html">Comida</a>
        </li>
        <li class="nav-item">
          <a class="nav-link <?= ($pagina == 'reservas.html') ? 'active' : '' ?>" href="modulos/reservas.html">Reservas</a>
        </li>
        <li class="nav-item">
          <a class="nav-link <?= ($pagina == 'login.php') ? 'active' : '' ?>" href="modulos/login.php">Log in</a>
        </li>
        <li class="nav-item">
          <a class="nav-link <?= ($pagina == 'sing.html') ? 'active' : '' ?>" href="modulos/singin.html">Sing in</a>
        </li>
      </ul>
    </div>
  </div>
</nav>