let template: google.script.Template | undefined = undefined;

// Fetch template variables from Server
init();

function init() {
    // @ts-ignore
    google.script.url.getLocation(loadTemplate);
}

function loadTemplate(location: google.script.IUrlLocation) {
    const parameters = location.parameter;
    disableButtons(true);
    return google.script.run.withSuccessHandler((t: google.script.Template) => setTemplate(t)).getTemplate(parameters);
}

function setTemplate(t: google.script.Template) {
    template = t;
    disableButtons(false);
}

function calculate() {
    disableButtons(true);
    if (template) {
        google.script.run.withSuccessHandler(() => {
            try {
                fireCalculateForAll();
            } catch (error) {
                showError(error);
            }
        })
            .withFailureHandler((error) => {
                showError(error);
            })
            .validate(template.book.id)
            ;
    }
}

function fireCalculateForAll() {
    if (template) {
        if (template.account) {
            google.script.run.withSuccessHandler(disableButtons).withFailureHandler(showError).calculateCostOfSales(template.book.id, template.account.id);
        }
    }
}

function showError(error: any) {
    window.alert(error);
}

function disableButtons(disable: boolean) {
    if (disable) {
        $('#calculate-button').prop('disabled', true);
        $('#close-button').prop('disabled', true);
    } else {
        $('#calculate-button').prop('disabled', false);
        $('#close-button').prop('disabled', false);
    }
}

function closeWindow() {
    try {
        window.close();
    } catch (error) {
        console.log("Attempt to automatically close window failed: " + error);
        showError(error);
    }
}