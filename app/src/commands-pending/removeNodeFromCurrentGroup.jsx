export const config = {
  id: "removeNodeFromCurrentGroup",
  i18n: {
    en: {
      "command.removeNodeFromCurrentGroup.title": "Remove From Current Group",
      "command.removeNodeFromCurrentGroup.description":
        "Remove selected node from the active group",
      "toast.command.removeNodeFromCurrentGroup.success":
        "Selected node removed from group",
      "toast.command.removeNodeFromCurrentGroup.noSelection":
        "Select a node first",
      "toast.command.removeNodeFromCurrentGroup.noGroup":
        "Selected node is not in the current group",
    },
    zh: {
      "command.removeNodeFromCurrentGroup.title": "移出当前编组",
      "command.removeNodeFromCurrentGroup.description":
        "将选中节点移出当前激活编组",
      "toast.command.removeNodeFromCurrentGroup.success": "已将选中节点移出编组",
      "toast.command.removeNodeFromCurrentGroup.noSelection": "请先选中一个节点",
      "toast.command.removeNodeFromCurrentGroup.noGroup":
        "选中节点不在当前编组内",
    },
  },
  titleKey: "command.removeNodeFromCurrentGroup.title",
  title: "Remove From Current Group",
  descriptionKey: "command.removeNodeFromCurrentGroup.description",
  description: "Remove selected node from the active group",
  keywords: ["group", "ungroup", "detach", "node", "移出编组", "节点", "退组"],
};

export const run = ({ actions }) => {
  const result = actions.canvasActions.removeSelectedItemsFromCurrentGroup();

  if (result === "no-selection") {
    actions.globalActions.pushToast(
      { key: "toast.command.removeNodeFromCurrentGroup.noSelection" },
      "warning",
    );
    return;
  }

  if (result === "no-group") {
    actions.globalActions.pushToast(
      { key: "toast.command.removeNodeFromCurrentGroup.noGroup" },
      "warning",
    );
    return;
  }

  actions.globalActions.pushToast(
    { key: "toast.command.removeNodeFromCurrentGroup.success" },
    "success",
  );
};
