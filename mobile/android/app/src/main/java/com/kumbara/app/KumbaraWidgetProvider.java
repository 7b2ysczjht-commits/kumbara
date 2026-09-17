package com.kumbara.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class KumbaraWidgetProvider extends AppWidgetProvider {
    public static final String PREFS_NAME = "KumbaraWidgetPrefs";
    public static final String KEY_TOTAL = "total";
    public static final String KEY_BANK_NAME = "bankName";

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new android.content.ComponentName(context, KumbaraWidgetProvider.class));
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String total = prefs.getString(KEY_TOTAL, "₺0,00");
        String bankName = prefs.getString(KEY_BANK_NAME, "Kumbaram");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_kumbara);
        views.setTextViewText(R.id.widget_total, total);
        views.setTextViewText(R.id.widget_bank_name, bankName);

        Intent launchIntent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        manager.updateAppWidget(widgetId, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            updateWidget(context, manager, id);
        }
    }
}
