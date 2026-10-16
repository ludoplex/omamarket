import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Omamarket storefront panel. One lane at a time; two blocks per lane:
// A) the publisher's own listings, pinned and labeled (sponsored), B) the store's native order.
// All network and parsing happens in the helper APE (omamarket.com), launched through /bin/sh
// because Quickshell's Process execs directly and an APE is a shell script by specification.
Panel {
  id: root
  moduleName: "io.github.ludoplex.omamarket"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null

  property string lane: "odoo"
  property string query: ""
  property var result: ({})
  property var rows: []
  property bool loading: false
  property bool helperMissing: false
  property string errorText: ""
  property string helperOutput: ""
  property string installOutput: ""

  readonly property string helper: Model.helperPath({
    HOME: Quickshell.env("HOME"), XDG_DATA_HOME: Quickshell.env("XDG_DATA_HOME") })
  readonly property string installScript: Model.localPath(Qt.resolvedUrl("bin/install-helper.sh"))

  function open() {
    root.controller.show()
    if (!rows.length && !loading) refresh()
  }

  function close() {
    root.controller.hide()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.hostWidget || root, direction)
    return false
  }

  function refresh() {
    if (catalogProcess.running) return
    errorText = ""
    loading = true
    helperOutput = ""
    var args = ["catalog", lane, "--limit", "30"]
    if (query.length) args = args.concat(["--query", query])
    catalogProcess.command = Model.helperCommand(helper, args)
    catalogProcess.running = true
  }

  function applyOutput(text, exitCode) {
    loading = false
    var obj = Model.parseOutput(text)
    if (exitCode === 127 || exitCode === 126) {
      helperMissing = true
      errorText = "Helper not installed at " + helper
      rows = []
      return
    }
    helperMissing = false
    if (!obj.ok) {
      errorText = obj.error || ("helper exited " + exitCode)
      rows = []
      return
    }
    result = obj
    rows = Model.rows(obj)
  }

  function openUrl(url) {
    if (!url || !/^https?:\/\//.test(url)) return
    Quickshell.execDetached(["xdg-open", url])
  }

  function installHelper() {
    if (installProcess.running) return
    installOutput = ""
    installProcess.command = ["bash", installScript]
    installProcess.running = true
  }

  function selectLane(next) {
    if (lane === next) return
    lane = next
    refresh()
  }

  Process {
    id: catalogProcess
    stdout: StdioCollector { id: catalogOut }
    stderr: StdioCollector { id: catalogErr }
    onExited: function(exitCode) {
      root.helperOutput = catalogOut.text
      if (/No such file|can't open|cannot open/i.test(catalogErr.text)) exitCode = 127
      root.applyOutput(root.helperOutput, exitCode)
    }
  }

  Process {
    id: installProcess
    stdout: StdioCollector { id: installOut }
    stderr: StdioCollector { id: installErr }
    onExited: function(exitCode) {
      root.installOutput = installOut.text
      if (exitCode === 0) { root.helperMissing = false; root.refresh() }
      else root.errorText = "Install failed: " + installErr.text.trim().slice(0, 200)
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(480))
    // Capped so a 30-row lane leaves the bottom of the screen free; the Flickable scrolls the rest.
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(800))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      // Long lanes scroll inside the card instead of running past the screen edge
      // (the pattern of the first-party weather and clock panels).
      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: content
          width: scroll.width
          spacing: Style.space(8)

          Flow {
            width: parent.width
            spacing: Style.space(4)
            Repeater {
              model: Model.LANES
              Button {
                required property string modelData
                text: Model.LANE_LABELS[modelData]
                selected: root.lane === modelData
                bordered: true
                onClicked: root.selectLane(modelData)
              }
            }
          }

          Row {
            width: parent.width
            spacing: Style.space(6)
            Rectangle {
              width: parent.width - refreshButton.width - Style.space(6)
              height: Style.space(28)
              color: "transparent"
              border.color: root.barForeground
              border.width: 1
              radius: Style.space(4)
              TextInput {
                id: queryInput
                anchors.fill: parent
                anchors.margins: Style.space(6)
                color: root.barForeground
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.body
                text: root.query
                onAccepted: { root.query = text; root.refresh() }
              }
            }
            Button {
              id: refreshButton
              text: root.loading ? "…" : "Search"
              bordered: true
              onClicked: { root.query = queryInput.text; root.refresh() }
            }
          }

          Text {
            textFormat: Text.PlainText
            visible: root.errorText.length > 0
            width: parent.width
            text: root.errorText
            color: root.barForeground
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Button {
            visible: root.helperMissing
            text: "Install helper (verified download)"
            bordered: true
            onClicked: root.installHelper()
          }

          Repeater {
            model: root.rows
            delegate: Item {
              id: row
              required property var modelData
              width: content.width
              implicitHeight: rowColumn.implicitHeight + Style.space(4)
              Column {
                id: rowColumn
                width: parent.width
                spacing: Style.space(2)
                Text {
                  textFormat: Text.PlainText
                  visible: row.modelData.kind === "header"
                  width: parent.width
                  text: row.modelData.kind === "header" ? row.modelData.text : ""
                  color: root.barForeground
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                  font.bold: true
                }
                Text {
                  textFormat: Text.PlainText
                  visible: row.modelData.kind === "header" && (row.modelData.hint || "").length > 0
                  width: parent.width
                  text: row.modelData.hint || ""
                  color: root.barForeground
                  opacity: 0.7
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }
                Text {
                  textFormat: Text.PlainText
                  visible: row.modelData.kind === "empty"
                  width: parent.width
                  text: row.modelData.kind === "empty" ? row.modelData.text : ""
                  color: root.barForeground
                  opacity: 0.7
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.WordWrap
                }
                Rectangle {
                  visible: row.modelData.kind === "item"
                  width: parent.width
                  height: itemText.implicitHeight + Style.space(8)
                  color: row.modelData.sponsored ? Qt.rgba(1, 1, 1, 0.06) : "transparent"
                  radius: Style.space(4)
                  Column {
                    id: itemText
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.margins: Style.space(4)
                    anchors.verticalCenter: parent.verticalCenter
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: (row.modelData.kind === "item" ? row.modelData.item.name : "")
                        + (row.modelData.sponsored ? "  · sponsored" : "")
                      color: root.barForeground
                      font.family: root.bar ? root.bar.fontFamily : Style.font.family
                      font.pixelSize: Style.font.body
                      font.bold: row.modelData.sponsored === true
                      elide: Text.ElideRight
                    }
                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      text: row.modelData.kind === "item"
                        ? [row.modelData.item.author, Model.priceText(row.modelData.item), Model.statText(row.modelData.item)].filter(function(s) { return s && s.length }).join(" · ")
                        : ""
                      color: root.barForeground
                      opacity: 0.7
                      font.family: root.bar ? root.bar.fontFamily : Style.font.family
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }
                  }
                  MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.openUrl(row.modelData.item.url)
                  }
                }
              }
            }
          }

          Button {
            visible: !!(root.result && root.result.searchUrl)
            text: "Open store search in browser"
            bordered: true
            onClicked: root.openUrl(root.result.searchUrl)
          }
        }
      }
    }
  }
}
