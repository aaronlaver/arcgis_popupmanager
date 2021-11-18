# arcgis_popupmanager
Modifies WAB Dev edition so popups show up in the order of the map rather than "first come, first to the top" strategy. Note that this will create a small performance lag behind the default structure.

# Prerequisites
- Web Appbuilder (WAB) Developer Edition
- ArcGIS Creator License

# Instructions for Implementation
- Enter the "jimu.js" folder within the web application you'd like to modify
  - e.g., "webappbuilder\ArcGISWebAppBuilder\server\apps\2\jimu.js"
- Copy and relocate or rename the "PopupManager.js" file 
- Place this file within the current directory (jimu.js) as "PopupManager.js"
- Test within Browser-based WAB user interface. 


