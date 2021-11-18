// THIS FILE HAS BEEN MODIFIED FROM ITS ORIGINAL VERSION BY AARON LAVER
///////////////////////////////////////////////////////////////////////////
// Copyright © Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////
define([
  'dojo/_base/declare',
  'dojo/_base/lang',
  'dojo/_base/html',
  'dojo/Deferred',
  'dojo/topic',
  'dojo/on',
  'dojo/query',
  './FeatureActionManager',
  './utils',
  './dijit/FeatureActionPopupMenu',
  './RelatedRecordsPopupProjector',
  './LayerInfos/LayerInfos',
  'dojo/_base/array',
  'dojo/promise/all',
  'dojo/Deferred',
  'dojo/aspect',
  './LayerStructure'
  ], function(declare, lang, html, Deferred, topic, on, query, FeatureActionManager,
  jimuUtils, PopupMenu, RelatedRecordsPopupProjector, LayerInfos,array, all, Deferred, aspect, LayerStructure) {
    var instance = null;
    var clazz = declare(null, {
      mapManager: null,
      // popupUnion = {
      //   mobile: is mobile popup of map,
      //   bigScreen: is popup of map
      // };
      popupUnion: null,
      _relatedRecordsPopupProjector: null,

      constructor: function(options) {
        lang.mixin(this, options);

        this.popupMenu = PopupMenu.getInstance();
        this.isInited = false;

        this.featureActionManager = FeatureActionManager.getInstance();
        topic.subscribe("mapLoaded", lang.hitch(this, this.onMapLoadedOrChanged));
        topic.subscribe("mapChanged", lang.hitch(this, this.onMapLoadedOrChanged));
        topic.subscribe("appConfigChanged", lang.hitch(this, this._onAppConfigChanged));
        topic.subscribe("widgetsActionsRegistered", lang.hitch(this, this._onWidgetsActionsRegistered));
      },

      init: function() {
        this.popupUnion = this.mapManager.getMapInfoWindow();
        if(!this.popupUnion.bigScreen || !this.popupUnion.mobile ||
          !this.popupUnion.bigScreen.domNode || !this.popupUnion.mobile.domNode){
          return;
        }
        if(!this.isInited){
          this._createPopupMenuButton();
          this._bindSelectionChangeEvent();
          this.isInited = true;
        }

        this.reorderPopupFeatures();
      },
      reorderPopupFeatures: function() {
        var that = this;
        this.layerStructrue = LayerStructure.getInstance();
        // intercept the popup.setFeatures method, reorder feautres and recall original popup.setFeatures method.
        aspect.around(this.popupUnion.bigScreen, "setFeatures", function(originalSetFeatures) {
          return function(featuresArg, options) {
            var convertedFeatureDefs = [];
            // having to consider that there are two categories of features parameter can be received.
            //  1, feature array
            //  2, deferred array
            array.forEach(featuresArg, function(featureOrDef) {
              if(featureOrDef.declaredClass === "esri.Graphic") {
                // it is a feature
                var def = new Deferred();
                def.resolve([featureOrDef]);
                convertedFeatureDefs.push(def);
              } else {
                // it is a deferred
                convertedFeatureDefs.push(featureOrDef);
              }
            });
            this.clearFeatures();
            all(convertedFeatureDefs).then(lang.hitch(this, function(results) {
              var features = [];
              array.forEach(results, function(result) {
                array.forEach(result, function(feature) {
                  if(feature) {
                    // remove duplicated features
                    var featureAlreadyExist = array.some(features, function(f) {
                      if(feature === f) {
                        return true;
                      } else {
                        return false;
                      }
                    });
                    if(!featureAlreadyExist) {
                      features.push(feature);
                    }
                  }
                });
              }, this);
              // sort features by layers order.
              var orderedFeatures = that.sortFeatures(features);
              // recall origin setFeatures.
              originalSetFeatures.apply(this, [orderedFeatures, options]);
            }));
          };
        });
        // js-api will using options.closetFirst paramether to show popup by default when clicking the map.
        // this paramether will impact features order, so having to deny it.
        // that means the closeFirst parameter will never tack effect for show popup in the WAB environment.
        aspect.around(this.popupUnion.bigScreen, 'show', function(originalShow) {
          return function(location/*, options*/) {
            originalShow.apply(this, [location, false]);
          };
        });
      },
      // accordiing to layers order to sort features
      sortFeatures: function(features) {
        if(!this.layerOrderPriority) {
          // according to layers order to define a priority object, using to sort features.
          this.layerOrderPriority = {};
          var priority = 1;
          this.layerStructrue.traversal(lang.hitch(this, function(layerNode) {
            this.layerOrderPriority[layerNode.id] = priority++;
          }));
        }
        // update this.layerOrderPriority if the layer structure has been changed.
        if(!this.layerStructureChangeHandler) {
          this.layerStructureChangeHandler = this.layerStructrue.on('structure-change', lang.hitch(this, function() {
            this.layerOrderPriority = null;
          }));
        }
        array.forEach(features, function(feature) {
          if(feature && feature.getLayer) {
            feature._priority = this.layerOrderPriority[feature.getLayer().id];
          } else {
            feature._priority = 100000;
          }
        }, this);
//       features.sort(function(featureA, featureB) {
//         return featureA._priority > featureB._priority;
//        });
		
		features.sort(function(featureA, featureB) {
			if(featureA._priority > featureB._priority)
			{ return 1;}
			else
			{ return -1;}
			return 0;
			});
        return features;
      },

      _createPopupMenuButton: function(){
        if(this.popupMenuButtonDesktop) {
          html.destroy(this.popupMenuButtonDesktop);
        }
        if(this.popupMenuButtonMobile) {
          html.destroy(this.popupMenuButtonMobile);
        }
        this.popupMenuButtonDesktop = html.create('span', {
          'class': 'popup-menu-button'
        }, query(".actionList", this.popupUnion.bigScreen.domNode)[0]);

        var mobileActionListNode =
          query("div.esriMobileInfoView.esriMobilePopupInfoView .esriMobileInfoViewItem").parent()[0];
        var mobileViewItem = html.create('div', {
            'class': 'esriMobileInfoViewItem'
          }, mobileActionListNode);
        this.popupMenuButtonMobile = html.create('span', {
          'class': 'popup-menu-button'
        }, mobileViewItem);

        on(this.popupMenuButtonMobile, 'click', lang.hitch(this, this._onPopupMenuButtonClick));
        on(this.popupMenuButtonDesktop, 'click', lang.hitch(this, this._onPopupMenuButtonClick));
      },

      _onPopupMenuButtonClick: function(evt){
        var position = html.position(evt.target);
        if(this.menuActionsOfSelectedFeature) {
          this.popupMenu.setActions(this.menuActionsOfSelectedFeature);
        }
        this.popupMenu.show(position);
      },

      _bindSelectionChangeEvent: function(){
        on(this.popupUnion.bigScreen, "selection-change", lang.hitch(this, this._onSelectionChange));
        on(this.popupUnion.mobile, "selection-change", lang.hitch(this, this._onSelectionChange));
      },

      _onSelectionChange: function(evt){
        this.selectedFeature = evt.target.getSelectedFeature();
        if(!this.selectedFeature){
          this._disablePopupMenu();
          return;
        }
        this.initPopupMenu([this.selectedFeature]);

        var selectedFeatureLayer = this.selectedFeature.getLayer();
        var hasInfoTemplate = this.selectedFeature.infoTemplate ||
                              (selectedFeatureLayer && selectedFeatureLayer.infoTemplate);
        if(hasInfoTemplate) {
          this._createRelatedRecordsPopupProjector(this.selectedFeature);
        }
      },

      _disablePopupMenu: function() {
        html.addClass(this.popupMenuButtonDesktop, 'disabled');
        html.addClass(this.popupMenuButtonMobile, 'disabled');
      },

      _enablePopupMenu: function() {
        html.removeClass(this.popupMenuButtonDesktop, 'disabled');
        html.removeClass(this.popupMenuButtonMobile, 'disabled');
      },

      convertFeatures: function(features) {
        var def = new Deferred();
        var layerInfos = LayerInfos.getInstanceSync();
        var featureLayer = features && features[0] && features[0].getLayer();
        var layerInfo = layerInfos.getLayerInfoById(featureLayer && featureLayer.id);
        if(layerInfo) {
          def = layerInfo.getMSShipFeatures(features);
        } else {
          def.resolve(null);
        }
        return def;
      },

      // public method, can be called from outside.
      initPopupMenu: function(features){
        if(!features) {
          this._disablePopupMenu();
          this.popupMenu.setActions([]);
          return;
        }
        this.convertFeatures(features).then(lang.hitch(this, function(msShipFeatures) {
          var featureSet = jimuUtils.toFeatureSet(msShipFeatures || features);
          this.featureActionManager.getSupportedActions(featureSet).then(lang.hitch(this, function(actions){
            var excludeActions = ['ZoomTo', 'ShowPopup', 'Flash', 'ExportToCSV',
              'ExportToFeatureCollection', 'ExportToGeoJSON', 'ShowRelatedRecords',
              'SaveToMyContent', 'CreateLayer'];
            var popupActions = actions.filter(lang.hitch(this, function(action){
              return excludeActions.indexOf(action.name) < 0 ;
            }));

            if(popupActions.length === 0){
              this._disablePopupMenu();
            }else{
              this._enablePopupMenu();
            }
            var menuActions = popupActions.map(lang.hitch(this, function(action){
              //action.data = jimuUtils.toFeatureSet(feature);
              action.data = featureSet;
              return action;
            }));
            this.menuActionsOfSelectedFeature = menuActions;
            this.popupMenu.setActions(menuActions);
          }));
        }));
      },

      /******************************
       * Events
       ******************************/
      onMapLoadedOrChanged: function() {
        this.isInited = false;
        this.init();
      },

      _onAppConfigChanged: function() {
        if(this.popupUnion) {
          if(this.popupUnion.bigScreen && this.popupUnion.bigScreen.hide) {
            this.popupUnion.bigScreen.hide();
            this.popupMenu.hide();
          }
          if(this.popupUnion.mobile && this.popupUnion.mobile.hide) {
            this.popupUnion.mobile.hide();
            this.popupMenu.hide();
          }
        }
      },

      _onWidgetsActionsRegistered: function(){
        //to init actions
        this.init();
      },

      /**********************************
       * Methods for show related records
       **********************************/

      _createRelatedRecordsPopupProjector: function(selectedFeature) {
        try {
          if(this._relatedRecordsPopupProjector &&
             this._relatedRecordsPopupProjector.domNode) {
            this._relatedRecordsPopupProjector.destroy();
            this._relatedRecordsPopupProjector = null;
          }
          //var refDomNode = query(".esriViewPopup", this.popupUnion.bigScreen.domNode)[0];
          this._relatedRecordsPopupProjector = new RelatedRecordsPopupProjector({
            originalFeature: selectedFeature,
            //refDomNode: refDomNode,
            popup: this.mapManager.map.infoWindow,
            popupManager: this
          });
        } catch(err) {
          console.warn(err.message);
        }
      }


    });

    clazz.getInstance = function(mapManager) {
      if (instance === null) {
        instance = new clazz({
          mapManager: mapManager
        });
      }
      return instance;
    };

    return clazz;
  });
