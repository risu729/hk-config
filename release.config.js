// Ref: https://semantic-release.gitbook.io/semantic-release/usage/configuration

/**
 * @type {import("semantic-release").Options}
 */
const config = {
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		[
			"@semantic-release/github",
			{
				successComment: false,
				failCommentCondition: false,
			},
		],
	],
};

export default config;
