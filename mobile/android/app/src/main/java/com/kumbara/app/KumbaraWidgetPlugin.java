package com.kumbara.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KumbaraWidget")
public class KumbaraWidgetPlugin extends Plugin {

    @PluginMethod
    public void updateWidget(PluginCall call) {
        String total = call.getString("total", "₺0,00");
        String bankName = call.getString("bankName", "Kumbaram");

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(
            KumbaraWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE
        );
        prefs.edit()
            .putString(KumbaraWidgetProvider.KEY_TOTAL, total)
            .putString(KumbaraWidgetProvider.KEY_BANK_NAME, bankName)
            .apply();

        KumbaraWidgetProvider.updateAllWidgets(context);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
}
