sed -i '/const unsubStaff = subscribeCollection/i \
    const unsubSettings = subscribeCollection<SystemSettingsType>("settings", (items) => {\
      const globalSettings = items.find(s => s.id === "global");\
      if (globalSettings) {\
        setSettings(globalSettings);\
      }\
    });\
' src/App.tsx
sed -i '/unsubStaff();/a \      unsubSettings();' src/App.tsx
