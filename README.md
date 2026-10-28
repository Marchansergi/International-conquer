# 🌍 Conquista Mundial

Juego de estrategia por turnos que se juega directamente en el navegador. Elige cualquier país del globo, forma alianzas, expande tu ejército y tu capital, conquista territorios y bombardea a tus enemigos hasta dominar el mundo.

**Sin instalación ni dependencias:** HTML + CSS + JavaScript puro. El mapa está incluido en el repositorio, así que funciona sin conexión.

## ▶️ Jugar

- **En GitHub Pages:** `https://marchansergi.github.io/International-conquer/` (ver [Publicación](#-publicación-en-github-pages)).
- **En local:** abre `index.html` en tu navegador, o sirve la carpeta:
  ```bash
  python3 -m http.server 8000   # y visita http://localhost:8000
  ```

## ✨ Características

| Área | Qué puedes hacer |
|---|---|
| **Elegir país** | 173 naciones y territorios con población, PIB y capacidad militar reales aproximados. Cada país indica su nivel de dificultad. |
| **Conquista** | Ataca territorios vecinos por tierra o mar (⚓). Reparte tropas desde varias fronteras, consulta la probabilidad de victoria antes de atacar. Capturar una capital da botín y desestabiliza al enemigo. |
| **Ejército** | Recluta en cada territorio (hasta su capacidad), mueve tropas por tu red de territorios, fortifica y mejora tecnología (doctrina, defensa, marina). |
| **Capital y economía** | Mejora la infraestructura de cada territorio, **amplía tu capital** (más ingresos y capacidad militar para todo el imperio) e investiga Economía avanzada. |
| **Bombardeos** | Fuerza aérea con alcance creciente: bombardeo *táctico* (mata tropas) o *estratégico* (daña la economía). La defensa antiaérea reduce el daño. Con el programa nuclear nivel 3, ataque nuclear (¡con consecuencias diplomáticas!). |
| **Diplomacia** | Propón alianzas (las IA evalúan relaciones, enemigos comunes y poder), declara guerra, negocia la paz, envía regalos, rompe pactos, únete a las guerras de tus aliados y recibe propuestas de otras naciones. Alianzas históricas opcionales (OTAN, OTSC…). |
| **Mundo vivo** | ~170 IA con personalidad propia que invierten, forman bloques, declaran guerras, conquistan, se rebelan y son eliminadas. Eventos aleatorios, disturbios y rebeliones en territorios conquistados. |
| **Victoria** | Domina la meta elegida (40–75 %) del mundo en área + población + PIB, o consigue con tus aliados el 90 %. |
| **Extras** | Capas del mapa (político, relaciones, militar, economía), zoom/arrastre/pellizco táctil, tema claro/oscuro, autoguardado, 3 dificultades, diseño responsive. |

## 🎮 Cómo se juega (resumen)

1. Elige un país (en el mapa o en la lista), dificultad y color, y pulsa **Gobernar**.
2. Cada turno equivale a un mes. Selecciona tus territorios para **reclutar**, mejorar infraestructura o fortificar; investiga en la pestaña **Imperio**.
3. Selecciona un territorio propio: los vecinos que puedes atacar se marcan con borde rojo discontinuo. Elige uno y pulsa **Atacar**.
4. Usa **Diplomacia** para aliarte, pedir la paz o declarar la guerra.
5. Pulsa **Terminar turno**: cobras ingresos y los demás países juegan.

Dentro del juego (botón ❔) tienes la ayuda completa.

## 🗂️ Estructura

```
index.html          Página principal
css/style.css       Estilos (tema claro/oscuro, responsive)
js/mapdata.js       Mapa generado (rutas SVG, centroides, adyacencias) — no editar a mano
js/engine.js        Motor del juego: reglas, economía, combate, diplomacia e IA (sin DOM)
js/mapview.js       Visor SVG con zoom/pan/táctil y efectos
js/ui.js            Interfaz: paneles, modales, turnos, guardado
tools/build-map.js  Regenera js/mapdata.js a partir de Natural Earth (world-atlas)
tools/sim.js        Simulación sin interfaz para probar el motor
tools/build-single.js  Empaqueta todo en un único HTML (dist/conquista-mundial.html)
```

### Regenerar el mapa o probar el motor

```bash
cd tools && npm install && node build-map.js      # regenera js/mapdata.js
node tools/sim.js 150 normal                      # simula 150 turnos con jugador pasivo
node tools/build-single.js                        # crea dist/conquista-mundial.html
```

## 🌐 Publicación en GitHub Pages

El sitio es estático, sin paso de compilación:

1. En el repositorio: **Settings → Pages**.
2. En *Build and deployment* elige **Deploy from a branch**, selecciona la rama (p. ej. `main`) y la carpeta **/ (root)**, y guarda.
3. En un minuto estará en `https://<usuario>.github.io/<repositorio>/`.

## 📝 Notas

- Las cifras de población, PIB y fuerza militar son aproximaciones con fines de juego, no datos oficiales.
- Datos del mapa: [Natural Earth](https://www.naturalearthdata.com/) (dominio público) vía [`world-atlas`](https://github.com/topojson/world-atlas). Algunos territorios disputados se simplifican (p. ej. Somalilandia se integra en Somalia y el norte de Chipre en Chipre).
