import { App } from './app'

window.app = new App()

document.addEventListener('DOMContentLoaded', () => {
  window.app.init()

  window.addEventListener('resize', function () {
    window.app.percentageBar.redraw()

    // Delegate to GraphDisplayManager which can check if the resize is necessary
    window.app.graphDisplayManager.requestResize()
  }, false)
}, false)
