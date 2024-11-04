export class HIDParser {
    parseInputReport(event, sdk) {
        throw new Error("This method should be overridden by subclasses.");
    }
}
