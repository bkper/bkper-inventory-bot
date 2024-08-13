let contextParams: google.script.ContextParams | undefined = undefined;

// Fetch template variables from Server
init();

function init() {
    // @ts-ignore
    google.script.url.getLocation(loadTemplate);
}

function loadTemplate(location: google.script.IUrlLocation) {
    const parameters = location.parameter;
    disableButtons(true);
    google.script.run.withSuccessHandler((params: google.script.ContextParams) => setParams(params)).getContextParams(parameters);
}

function setParams(params: google.script.ContextParams) {
    contextParams = params;
    google.script.run.withSuccessHandler(listAccounts).getAccountsToCalculate(contextParams);
}

function listAccounts(accounts: string[]) {
    const ul = $('#account-list');
    ul.append($('<li>').html('TESTE 1'));
    ul.append($('<li>').html('TESTE 2'));
    ul.append($('<li>').html('TESTE 3'));
    ul.show();

    disableButtons(false);
}

function calculate() {
    disableButtons(true);
    if (contextParams) {
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
            .validate(contextParams.book.id)
            ;
    }
}

function fireCalculateForAll() {
    google.script.run.withSuccessHandler(() => disableButtons(false)).withFailureHandler(showError).calculateCostOfSales(contextParams);
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
        window.top.close();
    } catch (error) {
        console.log("Attempt to automatically close window failed: " + error);
        showError(error);
    }
}