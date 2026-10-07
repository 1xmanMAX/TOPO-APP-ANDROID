package com.topoapp.nivelacion;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * La app ocupa la pantalla entera: la barra de estado (hora, batería) tapaba
 * la cabecera. Se esconde, y deslizando desde arriba vuelve a asomar un rato.
 * La barra de navegación de abajo se respeta con los márgenes que pone
 * Capacitor (`adjustMarginsForEdgeToEdge` en capacitor.config.json).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        esconderBarraDeEstado();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Al volver de otra app (WhatsApp, el menú de compartir) Android la vuelve a enseñar.
        if (hasFocus) esconderBarraDeEstado();
    }

    private void esconderBarraDeEstado() {
        WindowInsetsControllerCompat control = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        control.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        control.hide(WindowInsetsCompat.Type.statusBars());
    }
}
